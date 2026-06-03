import React, { useState } from "react";
import type { EditingLead } from "@/components/leads/types";
import { CRMContext } from "./useCRM";

type CrmRecord = EditingLead;

export const CRMProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [contacts, setContacts] = useState<CrmRecord[]>([]);
  const [deals, setDeals] = useState<Record<string, unknown>[]>([]);
  const [connectedCRMs, setConnectedCRMs] = useState<string[]>([]);

  return (
    <CRMContext.Provider value={{ contacts, setContacts, deals, setDeals, connectedCRMs, setConnectedCRMs }}>
      {children}
    </CRMContext.Provider>
  );
};
