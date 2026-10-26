import { Label, TabView, useState } from "scripting"

import { HomeView } from "./HomeView"
import { ScriptHubView, type ScriptHubInitialInput } from "./ScriptHubView"

/**
 * The two primary workflows stay separated so the module manager remains
 * fast and the Script-Hub converter can keep its own state while a user edits
 * a source URL.  A successful import bumps the manager refresh token instead
 * of making the converter know anything about the module list UI.
 */
export function AppView(props: { initialTab?: number; initialInput?: ScriptHubInitialInput } = {}) {
  const [tabIndex, setTabIndex] = useState(props.initialTab ?? 0)
  const [refreshToken, setRefreshToken] = useState(0)

  return (
    <TabView tabIndex={tabIndex} onTabIndexChanged={setTabIndex}>
      <HomeView
        tag={0}
        tabItem={<Label title="模块管理" systemImage="square.grid.2x2.fill" />}
        refreshToken={refreshToken}
      />
      <ScriptHubView
        tag={1}
        tabItem={<Label title="Script-Hub" systemImage="arrow.triangle.2.circlepath.circle.fill" />}
        initialInput={props.initialInput}
        onImported={() => setRefreshToken((value) => value + 1)}
      />
    </TabView>
  )
}
