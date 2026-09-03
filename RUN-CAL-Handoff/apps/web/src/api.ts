import { signInWithCustomToken, signOut } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { ref, uploadBytes } from 'firebase/storage'
import { auth, functions, storage } from './firebase'

export type State = {
  setupRequired: boolean
  user: { id: string; username: string; email: string; displayName: string }
  workspace: { workspaceId: string; workspaceName: string; roles: string[] }
  profile: null | { emergencyName: string; emergencyRelation: string; emergencyPhone: string; sportGoal: string; experienceYears: number; experienceNote: string; usesStryd: number }
  notifications: Array<{ id: string; title: string; body: string; href: string; readAt: string | null; createdAt: string }>
  recovery: null | { sleep: number; energy: number; soreness: number; stress: number; mood: number; note: string; checkinDate: string }
  monthly: Array<{ id: string; month: string; weightKg: number; cpWatts: number | null; wkg: number | null; comment: string; coachReply: string; createdAt: string }>
  activities: Array<{ id: string; title: string; activityDate: string; originalName: string; byteSize: number; deletedAt: string | null }>
  athletes: Array<{ id: string; displayName: string }>
  members: Array<{ id: string; displayName: string; email: string; roles: string[]; isTeamAdmin: boolean }>
}

function message(error: unknown): Error {
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return new Error(error.message)
  return new Error('Unable to complete this request')
}

async function call<T>(name: string, data: Record<string, unknown> = {}): Promise<T> {
  try {
    return (await httpsCallable<Record<string, unknown>, T>(functions, name)(data)).data
  } catch (error) {
    throw message(error)
  }
}

async function signIn(result: { token: string }) {
  await signInWithCustomToken(auth, result.token)
}

function unavailable<T>(feature: string): Promise<T> {
  return Promise.reject(new Error(`${feature} is being migrated to Firebase and is not available yet.`))
}

export const api = {
  setupStatus: () => call<{ setupRequired: boolean }>('getSetupStatus'),
  setup: async (body: Record<string, string>) => signIn(await call<{ token: string }>('setupFirstWorkspace', body)),
  acceptInvite: async (body: Record<string, string>) => signIn(await call<{ token: string }>('acceptInvite', { ...body, inviteToken: body.token })),
  login: async (username: string, pin: string) => signIn(await call<{ token: string }>('loginWithUsernamePin', { username, pin })),
  logout: () => signOut(auth),
  bootstrap: () => call<State>('getBootstrap'),
  profile: (body: Record<string, unknown>) => call<{ saved: boolean }>('saveProfile', body),
  recovery: (body: Record<string, unknown>) => call<{ saved: boolean }>('saveRecovery', body),
  monthly: (body: Record<string, unknown>) => call<{ saved: boolean }>('saveMonthlyLog', body),
  invite: async (email: string, roles: string[]) => {
    const result = await call<{ expiresInMinutes: number }>('createInvite', { email, role: roles[0] || 'athlete' })
    return { expiresInMinutes: result.expiresInMinutes, delivery: 'Invitation email sent.' }
  },
  requestUsername: (email: string) => call<{ message: string }>('requestUsernameLookup', { email }),
  verifyUsername: (token: string) => call<{ username: string }>('verifyUsernameLookup', { token }),
  requestPinReset: (email: string) => call<{ message: string }>('requestPinReset', { email }),
  confirmPinReset: (token: string, pin: string) => call<{ reset: boolean }>('confirmPinReset', { token, pin }),
  cancelInvite: (_id: string) => unavailable<void>('Invitation cancellation'),
  startAdminTransfer: (_toUserId: string, _pin: string) => unavailable<{ transferId: string; transferToken?: string }>('Team Admin transfer'),
  acceptAdminTransfer: (_transferId: string) => unavailable<void>('Team Admin transfer'),
  markRead: (_id: string) => unavailable<void>('Notifications'),
  fit: async (file: File) => {
    const start = await call<{ uploadId: string }>('startFitUpload', { originalName: file.name, byteSize: file.size })
    const workspaceId = (await call<State>('getBootstrap')).workspace.workspaceId
    await uploadBytes(ref(storage, `fit-staging/${workspaceId}/${auth.currentUser?.uid}/${start.uploadId}`), file)
    return call<{ activityId: string; importStatus: string }>('completeFitUpload', { uploadId: start.uploadId })
  },
}
