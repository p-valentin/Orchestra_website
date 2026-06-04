export interface BetaState {
  ok: boolean
  message: string
  error?: string
}

export const initialBetaState: BetaState = { ok: false, message: '' }
