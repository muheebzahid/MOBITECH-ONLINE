'use client'

import React, { createContext, useContext } from 'react'

type Role = 'SUPER_ADMIN' | 'SALES' | 'LOGISTICS' | 'FINANCE'

const RoleContext = createContext<Role>('SALES')

export function RoleProvider({ role, children }: { role: Role, children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>
}

export function useRole() {
  return useContext(RoleContext)
}
