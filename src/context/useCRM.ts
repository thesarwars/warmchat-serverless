import { createContext, useContext } from "react";
import type React from "react";
import type { EditingLead } from "@/components/leads/types";

type CrmRecord = EditingLead;

export interface CRMContextType {
  contacts: CrmRecord[];
  setContacts: React.Dispatch<React.SetStateAction<CrmRecord[]>>;
  deals: Record<string, unknown>[];
  setDeals: React.Dispatch<React.SetStateAction<Record<string, unknown>[]>>;
  connectedCRMs: string[];
  setConnectedCRMs: React.Dispatch<React.SetStateAction<string[]>>;
}

export const CRMContext = createContext<CRMContextType | undefined>(undefined);

export const useCRM = () => {
  const context = useContext(CRMContext);
  if (!context) throw new Error("useCRM must be used within a CRMProvider");
  return context;
};
