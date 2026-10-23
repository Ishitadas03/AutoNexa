"use client";

import React, { useEffect } from "react";
import WorkspaceLayout from "@/components/workspace/WorkspaceLayout";
import OverviewTab from "@/components/workspace/OverviewTab";
import DatasetsTab from "@/components/workspace/DatasetsTab";
import ProfilingTab from "@/components/workspace/ProfilingTab";
import TrainingTab from "@/components/workspace/TrainingTab";
import LeaderboardTab from "@/components/workspace/LeaderboardTab";
import ExperimentsTab from "@/components/workspace/ExperimentsTab";
import PredictionTab from "@/components/workspace/PredictionTab";
import ModelRegistryTab from "@/components/workspace/ModelRegistryTab";
import PipelinesTab from "@/components/workspace/PipelinesTab";
import MonitoringTab from "@/components/workspace/MonitoringTab";
import ExplainabilityTab from "@/components/workspace/ExplainabilityTab";
import ErrorAnalysisTab from "@/components/workspace/ErrorAnalysisTab";
import BenchmarkingTab from "@/components/workspace/BenchmarkingTab";
import DocumentationTab from "@/components/workspace/DocumentationTab";
import SettingsTab from "@/components/workspace/SettingsTab";

import { WorkspaceTab } from "@/lib/store";
import { api } from "@/lib/api";
import {
  AnalysisResponse,
  DatasetProfileResponse,
  DatasetSummary,
  TrainingRequest,
  TrainingResponse,
} from "@/types/api";

interface WorkspaceViewProps {
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;
  onExitWorkspace: () => void;
  apiConnected: boolean | null;
  datasets: DatasetProfileResponse[];
  activeDataset: DatasetProfileResponse | null;
  setActiveDatasetId: (id: string) => void;
  experiments: TrainingResponse[];
  activeExperiment: TrainingResponse | null;
  setActiveExperimentId: (id: string) => void;
  activeAnalysis: AnalysisResponse | null;
  handleUploadFile: (file: File) => Promise<void>;
  handleUploadSample: (sampleId: string) => Promise<void>;
  handleRunAnalysis: (datasetId: string, targetColumn?: string) => Promise<void>;
  handleRunTraining: (request: TrainingRequest) => Promise<void>;
  isUploading: boolean;
  isAnalyzing: boolean;
  isTraining: boolean;
  trainingDuration: number;
  onRefreshHealth: () => void;
  syncDatasets: (datasets: DatasetSummary[]) => void;
}

export default function WorkspaceView({
  activeTab,
  setActiveTab,
  onExitWorkspace,
  apiConnected,
  datasets,
  activeDataset,
  setActiveDatasetId,
  experiments,
  activeExperiment,
  setActiveExperimentId,
  activeAnalysis,
  handleUploadFile,
  handleUploadSample,
  handleRunAnalysis,
  handleRunTraining,
  isUploading,
  isAnalyzing,
  isTraining,
  trainingDuration,
  onRefreshHealth,
  syncDatasets,
}: WorkspaceViewProps) {
  // Sync catalog when entering workspace if API is connected
  useEffect(() => {
    if (apiConnected) {
      api
        .listDatasets({ page: 1, pageSize: 50 })
        .then((catalog) => {
          if (catalog?.datasets?.length > 0) {
            syncDatasets(catalog.datasets);
          }
        })
        .catch((err) => {
          // May be unauthenticated if API key not entered yet
          console.debug("Dataset catalog sync on workspace mount:", err.message);
        });
    }
  }, [apiConnected, syncDatasets]);

  return (
    <WorkspaceLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onExitWorkspace={onExitWorkspace}
      apiConnected={apiConnected}
    >
      {activeTab === "overview" && (
        <OverviewTab
          datasets={datasets}
          experiments={experiments}
          onNavigateTab={setActiveTab}
          onUploadSample={handleUploadSample}
        />
      )}

      {activeTab === "datasets" && (
        <DatasetsTab
          datasets={datasets}
          activeDataset={activeDataset}
          activeAnalysis={activeAnalysis}
          onSelectDataset={setActiveDatasetId}
          onUploadFile={handleUploadFile}
          onUploadSample={handleUploadSample}
          onRunAnalysis={handleRunAnalysis}
          onProceedToTraining={() => setActiveTab("training")}
          onNavigateTab={setActiveTab}
          isLoading={isUploading}
          isAnalyzing={isAnalyzing}
        />
      )}

      {activeTab === "analysis" && (
        <ProfilingTab
          activeDataset={activeDataset}
          activeAnalysis={activeAnalysis}
          onRunAnalysis={handleRunAnalysis}
          onProceedToTraining={() => setActiveTab("training")}
          isAnalyzing={isAnalyzing}
        />
      )}

      {activeTab === "training" && (
        <TrainingTab
          activeDataset={activeDataset}
          onRunTraining={handleRunTraining}
          isTraining={isTraining}
          trainingDuration={trainingDuration}
        />
      )}

      {activeTab === "pipelines" && (
        <PipelinesTab datasets={datasets} onNavigateTab={setActiveTab} />
      )}

      {activeTab === "leaderboard" && (
        <LeaderboardTab
          activeExperiment={activeExperiment}
          onNavigateTab={setActiveTab}
        />
      )}

      {(activeTab === "experiments" || activeTab === "details") && (
        <ExperimentsTab
          experiments={experiments}
          activeExperiment={activeExperiment}
          onSelectExperiment={setActiveExperimentId}
          onNavigateTab={setActiveTab}
        />
      )}

      {activeTab === "prediction" && (
        <PredictionTab
          activeExperiment={activeExperiment}
          onNavigateTab={setActiveTab}
        />
      )}

      {activeTab === "explainability" && (
        <ExplainabilityTab
          activeExperiment={activeExperiment}
          experiments={experiments}
          onNavigateTab={setActiveTab}
          onSelectExperiment={setActiveExperimentId}
        />
      )}

      {activeTab === "error_analysis" && (
        <ErrorAnalysisTab
          activeExperiment={activeExperiment}
          experiments={experiments}
          onNavigateTab={setActiveTab}
          onSelectExperiment={setActiveExperimentId}
        />
      )}

      {activeTab === "benchmarks" && (
        <BenchmarkingTab
          experiments={experiments}
          activeExperiment={activeExperiment}
          onNavigateTab={setActiveTab}
          onSelectExperiment={setActiveExperimentId}
        />
      )}

      {activeTab === "models" && (
        <ModelRegistryTab
          experiments={experiments}
          activeExperiment={activeExperiment}
          onNavigateTab={setActiveTab}
        />
      )}

      {activeTab === "monitoring" && (
        <MonitoringTab onNavigateTab={setActiveTab} datasets={datasets} />
      )}

      {activeTab === "docs" && <DocumentationTab />}

      {activeTab === "settings" && (
        <SettingsTab apiConnected={apiConnected} onRefreshHealth={onRefreshHealth} />
      )}
    </WorkspaceLayout>
  );
}
