"""Mathematically rigorous Pareto dominance, multi-objective ranking, and resource-aware selection."""

import logging
import math
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
import numpy as np

from app.schemas.multi_objective import (
    CandidateMeasurement,
    ConstraintViolation,
    MultiObjectiveSelectionResult,
    ObjectiveDefinition,
    ObjectiveDirection,
    ParetoCandidateResult,
    ResourceConstraints,
    SelectionPolicy,
)

logger = logging.getLogger(__name__)

FLOAT_TOLERANCE = 1e-7


class ParetoFrontierCalculator:
    """Computes Pareto dominance for mixed optimization directions and enforces resource constraints."""

    @staticmethod
    def evaluate_constraints(
        measurement: CandidateMeasurement,
        constraints: Optional[ResourceConstraints],
    ) -> Tuple[bool, List[ConstraintViolation]]:
        """Evaluate candidate against resource boundaries and minimum performance thresholds."""
        if not constraints or measurement.status == "failed":
            is_feasible = measurement.status != "failed"
            violations: List[ConstraintViolation] = []
            if measurement.status == "failed":
                violations.append(
                    ConstraintViolation(
                        constraint_name="execution_status",
                        threshold=1.0,
                        actual_value=0.0,
                        unit="status",
                        message=f"Candidate training/profiling failed: {measurement.error_message or 'Unknown error'}",
                    )
                )
            return is_feasible, violations

        violations: List[ConstraintViolation] = []

        # 1. Training Duration constraint
        if constraints.max_training_duration_seconds is not None:
            if measurement.training_duration_seconds > constraints.max_training_duration_seconds + FLOAT_TOLERANCE:
                violations.append(
                    ConstraintViolation(
                        constraint_name="max_training_duration_seconds",
                        threshold=constraints.max_training_duration_seconds,
                        actual_value=measurement.training_duration_seconds,
                        unit="seconds",
                        message=(
                            f"Training time of {measurement.training_duration_seconds:.2f}s exceeds "
                            f"configured threshold of {constraints.max_training_duration_seconds:.2f}s."
                        ),
                    )
                )

        # 2. Inference Latency constraint
        if constraints.max_inference_latency_ms is not None:
            if measurement.inference_latency_ms_per_sample > constraints.max_inference_latency_ms + FLOAT_TOLERANCE:
                violations.append(
                    ConstraintViolation(
                        constraint_name="max_inference_latency_ms",
                        threshold=constraints.max_inference_latency_ms,
                        actual_value=measurement.inference_latency_ms_per_sample,
                        unit="ms/sample",
                        message=(
                            f"Prediction latency of {measurement.inference_latency_ms_per_sample:.4f} ms/sample "
                            f"exceeds ceiling of {constraints.max_inference_latency_ms:.4f} ms/sample."
                        ),
                    )
                )

        # 3. Model Artifact Size constraint
        if constraints.max_artifact_size_bytes is not None:
            if measurement.model_artifact_size_bytes > constraints.max_artifact_size_bytes:
                violations.append(
                    ConstraintViolation(
                        constraint_name="max_artifact_size_bytes",
                        threshold=float(constraints.max_artifact_size_bytes),
                        actual_value=float(measurement.model_artifact_size_bytes),
                        unit="bytes",
                        message=(
                            f"Model disk size of {measurement.model_artifact_size_bytes:,} bytes "
                            f"exceeds limit of {constraints.max_artifact_size_bytes:,} bytes."
                        ),
                    )
                )

        # 4. Peak Memory constraint
        if constraints.max_peak_memory_bytes is not None and measurement.peak_memory_bytes is not None:
            if measurement.peak_memory_bytes > constraints.max_peak_memory_bytes:
                violations.append(
                    ConstraintViolation(
                        constraint_name="max_peak_memory_bytes",
                        threshold=float(constraints.max_peak_memory_bytes),
                        actual_value=float(measurement.peak_memory_bytes),
                        unit="bytes",
                        message=(
                            f"Peak RAM allocation of {measurement.peak_memory_bytes:,} bytes "
                            f"exceeds boundary of {constraints.max_peak_memory_bytes:,} bytes."
                        ),
                    )
                )

        # 5. Minimum Predictive Score constraint
        if constraints.min_predictive_score is not None:
            score = measurement.validation_score
            if score is None:
                violations.append(
                    ConstraintViolation(
                        constraint_name="min_predictive_score",
                        threshold=constraints.min_predictive_score,
                        actual_value=0.0,
                        unit="score",
                        message="Validation score is undefined (failed evaluation).",
                    )
                )
            else:
                if measurement.predictive_direction == "maximize":
                    if score < constraints.min_predictive_score - FLOAT_TOLERANCE:
                        violations.append(
                            ConstraintViolation(
                                constraint_name="min_predictive_score",
                                threshold=constraints.min_predictive_score,
                                actual_value=score,
                                unit="score",
                                message=(
                                    f"Validation score of {score:.4f} is lower than required minimum "
                                    f"threshold of {constraints.min_predictive_score:.4f}."
                                ),
                            )
                        )
                else:
                    # Minimize direction (e.g. RMSE) - threshold is an upper bound on error
                    if score > constraints.min_predictive_score + FLOAT_TOLERANCE:
                        violations.append(
                            ConstraintViolation(
                                constraint_name="min_predictive_score",
                                threshold=constraints.min_predictive_score,
                                actual_value=score,
                                unit="error",
                                message=(
                                    f"Validation error of {score:.4f} exceeds acceptable maximum "
                                    f"error ceiling of {constraints.min_predictive_score:.4f}."
                                ),
                            )
                        )

        # 6. Model Complexity constraint
        if constraints.max_complexity is not None:
            comp_score = measurement.complexity.summary_complexity_score
            if comp_score > constraints.max_complexity + FLOAT_TOLERANCE:
                violations.append(
                    ConstraintViolation(
                        constraint_name="max_complexity",
                        threshold=constraints.max_complexity,
                        actual_value=comp_score,
                        unit=measurement.complexity.complexity_unit,
                        message=(
                            f"Structural complexity of {comp_score:.1f} {measurement.complexity.complexity_unit} "
                            f"exceeds ceiling of {constraints.max_complexity:.1f}."
                        ),
                    )
                )

        is_feasible = len(violations) == 0
        return is_feasible, violations

    @staticmethod
    def extract_objective_value(measurement: CandidateMeasurement, key: str) -> Optional[float]:
        """Extract scalar numerical objective value from a candidate measurement."""
        if key == "predictive_metric" or key == measurement.predictive_metric:
            return measurement.validation_score
        elif key in ("training_duration_seconds", "training_duration", "duration"):
            return measurement.training_duration_seconds
        elif key in ("inference_latency_ms", "latency", "inference_latency"):
            return measurement.inference_latency_ms_per_sample
        elif key in ("artifact_size_bytes", "artifact_size", "model_size"):
            return float(measurement.model_artifact_size_bytes)
        elif key in ("model_complexity", "complexity"):
            return measurement.complexity.summary_complexity_score
        elif key in ("peak_memory_bytes", "peak_memory", "memory"):
            return float(measurement.peak_memory_bytes) if measurement.peak_memory_bytes is not None else None
        elif hasattr(measurement, key):
            val = getattr(measurement, key)
            return float(val) if isinstance(val, (int, float)) else None
        return None


    @classmethod
    def check_dominance(
        cls,
        cand_a: CandidateMeasurement,
        cand_b: CandidateMeasurement,
        objectives: List[ObjectiveDefinition],
    ) -> Optional[bool]:
        """Test whether candidate A strictly dominates candidate B across specified objectives.

        Returns:
            True if A dominates B, False if A does not dominate B,
            or None if comparison is indeterminate due to missing values.
        """
        at_least_one_strictly_better = False

        for obj in objectives:
            val_a = cls.extract_objective_value(cand_a, obj.key)
            val_b = cls.extract_objective_value(cand_b, obj.key)

            if val_a is None or val_b is None:
                # Missing objective measurement prevents definitive mathematical dominance
                return None

            dir_mult = 1.0 if obj.direction == "maximize" else -1.0
            utility_a = dir_mult * val_a
            utility_b = dir_mult * val_b

            # A must be at least as good as B on all objectives (within tolerance)
            if utility_a < utility_b - FLOAT_TOLERANCE:
                return False

            # Check if A is strictly better on this objective
            if utility_a > utility_b + FLOAT_TOLERANCE:
                at_least_one_strictly_better = True

        return at_least_one_strictly_better

    @classmethod
    def compute_pareto_frontier(
        cls,
        measurements: List[CandidateMeasurement],
        objectives: List[ObjectiveDefinition],
        constraints: Optional[ResourceConstraints] = None,
    ) -> Tuple[List[ParetoCandidateResult], List[str]]:
        """Compute the non-dominated Pareto frontier among feasible candidates and categorize all models."""
        # 1. Feasibility evaluation
        evaluated_candidates: List[Tuple[CandidateMeasurement, bool, List[ConstraintViolation]]] = []
        for m in measurements:
            is_feasible, violations = cls.evaluate_constraints(m, constraints)
            evaluated_candidates.append((m, is_feasible, violations))

        feasible_measurements = [m for m, feas, _ in evaluated_candidates if feas]

        # 2. Pairwise dominance computation strictly among feasible candidates
        dominated_by_map: Dict[str, Set[str]] = {m.candidate_id: set() for m, _, _ in evaluated_candidates}
        dominates_map: Dict[str, Set[str]] = {m.candidate_id: set() for m, _, _ in evaluated_candidates}

        for i, cand_a in enumerate(feasible_measurements):
            for j, cand_b in enumerate(feasible_measurements):
                if i == j:
                    continue
                dom = cls.check_dominance(cand_a, cand_b, objectives)
                if dom is True:
                    dominates_map[cand_a.candidate_id].add(cand_b.candidate_id)
                    dominated_by_map[cand_b.candidate_id].add(cand_a.candidate_id)

        # 3. Calculate normalized scores [0, 1] for feasible candidates
        normalized_scores_map: Dict[str, Dict[str, float]] = {m.candidate_id: {} for m in feasible_measurements}
        for obj in objectives:
            vals = [
                cls.extract_objective_value(m, obj.key)
                for m in feasible_measurements
            ]
            valid_vals = [v for v in vals if v is not None]

            if valid_vals:
                min_v = min(valid_vals)
                max_v = max(valid_vals)
                span = max_v - min_v

                for m in feasible_measurements:
                    val = cls.extract_objective_value(m, obj.key)
                    if val is None:
                        # Omit missing objectives from normalized utility map
                        continue
                    elif span <= FLOAT_TOLERANCE:
                        normalized_scores_map[m.candidate_id][obj.key] = 1.0
                    else:
                        if obj.direction == "maximize":
                            u = (val - min_v) / span
                        else:
                            u = (max_v - val) / span
                        normalized_scores_map[m.candidate_id][obj.key] = round(float(u), 4)

        # 4. Calculate Euclidean distance to Utopia point (1.0 across valid measured objectives)
        utopia_dist_map: Dict[str, Optional[float]] = {}
        for m in feasible_measurements:
            scores = normalized_scores_map.get(m.candidate_id, {})
            valid_objs = [obj for obj in objectives if obj.key in scores]
            if valid_objs:
                sq_diffs = sum((1.0 - scores[obj.key]) ** 2 for obj in valid_objs)
                utopia_dist_map[m.candidate_id] = round(math.sqrt(sq_diffs / len(valid_objs)), 4)
            else:
                utopia_dist_map[m.candidate_id] = None

        # 5. Assemble ParetoCandidateResult objects
        results: List[ParetoCandidateResult] = []
        pareto_ids: List[str] = []

        for m, is_feasible, violations in evaluated_candidates:
            cid = m.candidate_id
            dom_by = sorted(list(dominated_by_map[cid]))
            dom_list = sorted(list(dominates_map[cid]))

            if not is_feasible:
                is_pareto = False
                explanation = f"Infeasible candidate: violated {len(violations)} resource constraint(s)."
            elif len(dom_by) == 0:
                is_pareto = True
                pareto_ids.append(cid)
                explanation = "Pareto-optimal: no competing feasible candidate strictly dominates this model across all objectives."
            else:
                is_pareto = False
                explanation = f"Dominated by {len(dom_by)} feasible candidate(s): {', '.join(dom_by[:3])}."

            results.append(
                ParetoCandidateResult(
                    measurement=m,
                    is_feasible=is_feasible,
                    constraint_violations=violations,
                    is_pareto_optimal=is_pareto,
                    dominated_by=dom_by,
                    dominates=dom_list,
                    status_explanation=explanation,
                    normalized_scores=normalized_scores_map.get(cid, {}),
                    distance_to_utopia=utopia_dist_map.get(cid),
                )
            )

        return results, pareto_ids

    @classmethod
    def select_model(
        cls,
        candidates: List[ParetoCandidateResult],
        policy: SelectionPolicy = "best_performance_constrained",
        custom_weights: Optional[Dict[str, float]] = None,
    ) -> MultiObjectiveSelectionResult:
        """Select optimal candidate among feasible Pareto alternatives based on the designated policy."""
        feasible = [c for c in candidates if c.is_feasible and c.measurement.status == "completed"]
        infeasible_count = len(candidates) - len(feasible)

        if not feasible:
            # Handle zero feasible candidates
            return MultiObjectiveSelectionResult(
                selected_candidate_id=None,
                policy_used=policy,
                satisfies_all_constraints=False,
                feasible_candidates_count=0,
                infeasible_candidates_count=infeasible_count,
                selection_explanation=(
                    "No candidate model satisfied all specified resource and performance constraints. "
                    "Review constraint thresholds or relax latency/size limits."
                ),
                selected_candidate=None,
                tied_candidate_ids=[],
                untouched_test_evaluation=None,
            )

        # Focus selection on feasible candidates (prioritizing Pareto-optimal set if available)
        pareto_pool = [c for c in feasible if c.is_pareto_optimal]
        selection_pool = pareto_pool if pareto_pool else feasible

        selected: Optional[ParetoCandidateResult] = None
        tied_ids: List[str] = []
        explanation: str = ""

        if policy == "best_performance_constrained":
            pred_dir = selection_pool[0].measurement.predictive_direction
            valid_perf = [c for c in selection_pool if c.measurement.validation_score is not None]
            if not valid_perf:
                selected = selection_pool[0]
                tied_ids = [c.measurement.candidate_id for c in selection_pool[1:]]
                explanation = (
                    f"Selected '{selected.measurement.model_name}' ({selected.measurement.candidate_id}) "
                    "as default candidate because validation scores were unavailable."
                )
            else:
                if pred_dir == "maximize":
                    best_score = max(c.measurement.validation_score for c in valid_perf)
                else:
                    best_score = min(c.measurement.validation_score for c in valid_perf)

                matches = [
                    c for c in valid_perf
                    if abs(c.measurement.validation_score - best_score) <= FLOAT_TOLERANCE
                ]
                selected = matches[0]
                tied_ids = [c.measurement.candidate_id for c in matches[1:]]
                metric_name = selected.measurement.predictive_metric
                explanation = (
                    f"Selected '{selected.measurement.model_name}' ({selected.measurement.candidate_id}) "
                    f"achieving peak validation {metric_name} of {best_score:.4f} while satisfying all operational constraints."
                )
                if tied_ids:
                    explanation += f" Note: {len(tied_ids)} candidate(s) tied within numerical tolerance ({', '.join(tied_ids)})."

        elif policy == "lowest_latency_constrained":
            min_lat = min(c.measurement.inference_latency_ms_per_sample for c in selection_pool)
            matches = [
                c for c in selection_pool
                if abs(c.measurement.inference_latency_ms_per_sample - min_lat) <= FLOAT_TOLERANCE
            ]
            selected = matches[0]
            tied_ids = [c.measurement.candidate_id for c in matches[1:]]
            explanation = (
                f"Selected '{selected.measurement.model_name}' ({selected.measurement.candidate_id}) "
                f"achieving lowest prediction latency of {min_lat:.4f} ms/sample among feasible models."
            )

        elif policy == "lowest_size_constrained":
            min_size = min(c.measurement.model_artifact_size_bytes for c in selection_pool)
            matches = [
                c for c in selection_pool
                if c.measurement.model_artifact_size_bytes == min_size
            ]
            selected = matches[0]
            tied_ids = [c.measurement.candidate_id for c in matches[1:]]
            explanation = (
                f"Selected '{selected.measurement.model_name}' ({selected.measurement.candidate_id}) "
                f"with minimum disk footprint of {min_size:,} bytes."
            )

        elif policy == "balanced_compromise":
            # If custom_weights are provided, compute weighted Euclidean distance to Utopia point
            candidate_distances: List[Tuple[ParetoCandidateResult, float]] = []

            for c in selection_pool:
                scores = c.normalized_scores or {}
                if custom_weights:
                    valid_keys = [k for k in custom_weights if k in scores and scores[k] is not None]
                    if valid_keys:
                        w_sum = sum(custom_weights[k] for k in valid_keys if custom_weights[k] > 0)
                        if w_sum > 0:
                            w_sq_diffs = sum(
                                custom_weights[k] * ((1.0 - scores[k]) ** 2)
                                for k in valid_keys
                                if custom_weights[k] > 0
                            )
                            dist = round(math.sqrt(w_sq_diffs / w_sum), 4)
                        else:
                            dist = c.distance_to_utopia if c.distance_to_utopia is not None else float("inf")
                    else:
                        dist = c.distance_to_utopia if c.distance_to_utopia is not None else float("inf")
                else:
                    dist = c.distance_to_utopia if c.distance_to_utopia is not None else float("inf")

                candidate_distances.append((c, dist))

            min_dist = min(d for _, d in candidate_distances) if candidate_distances else float("inf")
            matches = [
                c for c, d in candidate_distances
                if abs(d - min_dist) <= FLOAT_TOLERANCE
            ]
            selected = matches[0] if matches else selection_pool[0]
            tied_ids = [c.measurement.candidate_id for c in matches[1:]]
            weight_note = f" (custom weights: {custom_weights})" if custom_weights else ""
            explanation = (
                f"Selected '{selected.measurement.model_name}' ({selected.measurement.candidate_id}) "
                f"as the balanced compromise on the Pareto frontier (distance to Utopia: {min_dist:.4f}){weight_note}."
            )
            if tied_ids:
                explanation += f" Note: {len(tied_ids)} candidate(s) tied within numerical tolerance ({', '.join(tied_ids)})."

        return MultiObjectiveSelectionResult(
            selected_candidate_id=selected.measurement.candidate_id if selected else None,
            policy_used=policy,
            satisfies_all_constraints=True,
            feasible_candidates_count=len(feasible),
            infeasible_candidates_count=infeasible_count,
            selection_explanation=explanation,
            selected_candidate=selected,
            tied_candidate_ids=tied_ids,
            untouched_test_evaluation=selected.measurement.test_metrics if selected else None,
        )
