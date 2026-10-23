/** Application state management and local storage persistence for AutoNexa. */

import { useEffect, useState } from "react";
import {
  AnalysisResponse,
  DatasetProfileResponse,
  ExperimentInspectionResponse,
  TrainingResponse,
} from "@/types/api";

export type WorkspaceTab =
  | "overview"
  | "datasets"
  | "analysis"
  | "training"
  | "pipelines"
  | "leaderboard"
  | "experiments"
  | "details"
  | "prediction"
  | "explainability"
  | "error_analysis"
  | "benchmarks"
  | "models"
  | "monitoring"
  | "docs"
  | "settings";

export interface ToastMessage {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message?: string;
}

const STORAGE_KEY_DATASETS = "autonexa_datasets_v1";
const STORAGE_KEY_EXPERIMENTS = "autonexa_experiments_v1";
const STORAGE_KEY_ACTIVE_DATASET = "autonexa_active_dataset_v1";
const STORAGE_KEY_ACTIVE_EXP = "autonexa_active_exp_v1";

export function useAutoNexaStore() {
  const [activeView, setActiveView] = useState<"landing" | "workspace">("landing");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [datasets, setDatasets] = useState<DatasetProfileResponse[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<TrainingResponse[]>([]);
  const [activeExperimentId, setActiveExperimentId] = useState<string | null>(null);
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisResponse | null>(null);
  const [activeInspection, setActiveInspection] = useState<ExperimentInspectionResponse | null>(null);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedDatasets = localStorage.getItem(STORAGE_KEY_DATASETS);
      if (storedDatasets) {
        const parsed = JSON.parse(storedDatasets);
        setDatasets(parsed);
      }

      const storedExperiments = localStorage.getItem(STORAGE_KEY_EXPERIMENTS);
      if (storedExperiments) {
        const parsed = JSON.parse(storedExperiments);
        setExperiments(parsed);
      }

      const storedActiveDs = localStorage.getItem(STORAGE_KEY_ACTIVE_DATASET);
      if (storedActiveDs) setActiveDatasetId(storedActiveDs);

      const storedActiveExp = localStorage.getItem(STORAGE_KEY_ACTIVE_EXP);
      if (storedActiveExp) setActiveExperimentId(storedActiveExp);
    } catch {
      // LocalStorage error or SSR
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY_DATASETS, JSON.stringify(datasets));
    } catch {
      // ignore
    }
  }, [datasets, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY_EXPERIMENTS, JSON.stringify(experiments));
    } catch {
      // ignore
    }
  }, [experiments, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      if (activeDatasetId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_DATASET, activeDatasetId);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_DATASET);
      }
    } catch {
      // ignore
    }
  }, [activeDatasetId, isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      if (activeExperimentId) {
        localStorage.setItem(STORAGE_KEY_ACTIVE_EXP, activeExperimentId);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACTIVE_EXP);
      }
    } catch {
      // ignore
    }
  }, [activeExperimentId, isLoaded]);

  const addDataset = (ds: DatasetProfileResponse) => {
    setDatasets((prev) => {
      const filtered = prev.filter((d) => d.dataset_id !== ds.dataset_id);
      return [ds, ...filtered];
    });
    setActiveDatasetId(ds.dataset_id);
  };

  const addExperiment = (exp: TrainingResponse) => {
    setExperiments((prev) => {
      const filtered = prev.filter((e) => e.experiment_id !== exp.experiment_id);
      return [exp, ...filtered];
    });
    setActiveExperimentId(exp.experiment_id);
  };

  const showToast = (toast: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const syncDatasets = (serverDatasets: DatasetProfileResponse[]) => {
    setDatasets((prev) => {
      const prevMap = new Map(prev.map((d) => [d.dataset_id, d]));
      const merged: DatasetProfileResponse[] = [];
      const seen = new Set<string>();

      for (const sDs of serverDatasets) {
        seen.add(sDs.dataset_id);
        const existing = prevMap.get(sDs.dataset_id);
        if (existing) {
          merged.push({
            ...sDs,
            preview_rows: existing.preview_rows || sDs.preview_rows,
          });
        } else {
          merged.push(sDs);
        }
      }

      for (const pDs of prev) {
        if (!seen.has(pDs.dataset_id)) {
          merged.push(pDs);
        }
      }

      return merged;
    });

    // If no active dataset is currently selected, select the first server dataset
    setActiveDatasetId((current) => current || (serverDatasets.length > 0 ? serverDatasets[0].dataset_id : null));
  };

  const activeDataset = datasets.find((d) => d.dataset_id === activeDatasetId) || null;
  const activeExperiment = experiments.find((e) => e.experiment_id === activeExperimentId) || null;

  return {
    activeView,
    setActiveView,
    activeTab,
    setActiveTab,
    datasets,
    setDatasets,
    syncDatasets,
    activeDatasetId,
    setActiveDatasetId,
    activeDataset,
    addDataset,
    experiments,
    activeExperimentId,
    setActiveExperimentId,
    activeExperiment,
    addExperiment,
    activeAnalysis,
    setActiveAnalysis,
    activeInspection,
    setActiveInspection,
    apiConnected,
    setApiConnected,
    toasts,
    showToast,
    dismissToast,
    isLoaded,
  };
}
