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

