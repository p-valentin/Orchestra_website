export interface ContactState {
  ok: boolean
  message: string
  errors: {
    name?: string
    email?: string
    message?: string
  }
}

export const initialContactState: ContactState = { ok: false, message: '', errors: {} }

export interface WaitlistState {
  ok: boolean
  message: string
  errors: {
    email?: string
  }
}

export const initialWaitlistState: WaitlistState = { ok: false, message: '', errors: {} }
