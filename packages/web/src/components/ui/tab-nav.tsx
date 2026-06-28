import * as React from "react"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface Tab {
  label: string
  key: string
}

interface TabNavProps {
  tabs: Tab[]
  activeTab: string
  onChange: (key: string) => void
  variant?: "line" | "default"
  children?: React.ReactNode
  className?: string
}

function TabNav({ tabs, activeTab, onChange, variant = "line", children, className }: TabNavProps) {
  return (
    <Tabs value={activeTab} onValueChange={onChange} className={className}>
      <TabsList variant={variant}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.key} value={tab.key}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  )
}

export { TabNav }
