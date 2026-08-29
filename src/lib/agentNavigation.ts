export type AgentPetMode = 'chat' | 'image' | 'video' | 'audio' | '3d'

export type AgentAppAction =
  | { type: 'settings'; providerId: string }
  | { type: 'models' }
  | { type: 'workspace'; mode: AgentPetMode; prompt: string }
  | { type: 'workflow-command'; command: import('./agentRuntime').AgentWorkflowCommand }

type AgentActionListener = (action: AgentAppAction) => void

const listeners = new Set<AgentActionListener>()
let pendingAction: AgentAppAction | undefined

export function requestAgentAppAction(action: AgentAppAction) {
  if (listeners.size) {
    listeners.forEach((listener) => listener(action))
    return
  }
  pendingAction = action
}

export function subscribeAgentAppActions(listener: AgentActionListener) {
  listeners.add(listener)
  if (pendingAction) {
    const action = pendingAction
    pendingAction = undefined
    listener(action)
  }
  return () => {
    listeners.delete(listener)
  }
}
