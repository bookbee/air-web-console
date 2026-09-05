"use client";

import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import { useState } from "react";

import { ClassifierTab } from "@/components/classifier/ClassifierTab";
import { Header } from "@/components/layout/Header";
import { TargetBar } from "@/components/layout/TargetBar";
import { LlmTab } from "@/components/llm/LlmTab";
import { OrchestratorTab } from "@/components/orchestrator/OrchestratorTab";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { SystemTab } from "@/components/system/SystemTab";
import { useConfig } from "@/hooks/useConfig";
import { useConnections } from "@/store/connectionStore";

const TAB_NAMES = ["Classifier", "Orchestrator", "LLM", "System"] as const;

export function ConsoleShell() {
  const { hydrated } = useConfig();
  const connections = useConnections();
  const [tab, setTab] = useState(0);

  if (!hydrated) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex" }}>
      <Sidebar />
      <Box sx={{ flex: 1, minWidth: 0, p: { xs: 1.5, md: 3 }, maxWidth: 1600, mx: "auto" }}>
        <Header />
        <TargetBar
          classifier={connections.classifier}
          orchestratorChat={connections.orchestratorChat}
          orchestratorQuery={connections.orchestratorQuery}
          llm={connections.llm}
        />
        <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mb: 2 }}>
          {TAB_NAMES.map((name) => (
            <Tab key={name} label={name} />
          ))}
        </Tabs>

        <Box role="tabpanel" hidden={tab !== 0}>
          {tab === 0 && <ClassifierTab connection={connections.classifier} />}
        </Box>
        <Box role="tabpanel" hidden={tab !== 1}>
          {tab === 1 && (
            <OrchestratorTab chat={connections.orchestratorChat} query={connections.orchestratorQuery} />
          )}
        </Box>
        <Box role="tabpanel" hidden={tab !== 2}>
          {tab === 2 && <LlmTab connection={connections.llm} />}
        </Box>
        <Box role="tabpanel" hidden={tab !== 3}>
          {tab === 3 && (
            <SystemTab
              classifier={connections.classifier}
              llm={connections.llm}
              orchestratorChat={connections.orchestratorChat}
              orchestratorQuery={connections.orchestratorQuery}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}
