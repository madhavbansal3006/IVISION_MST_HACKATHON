import type { Machine, Job, Activity, WorkProof } from '@/types'

export const NETWORK_CONFIG = {
  name: 'MST Testnet',
  chainId: 91562037,
  testnet: true,
  machineMandiContract: '0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE',
}

export const WALLET_ADDRESS = '0x6148b7054b47c7c2C27e06A6da5C3F5d01E9031A'
export const WALLET_BALANCE = 59.99

export const mockMachines: Machine[] = [
  {
    id: 1,
    name: 'IRRIGATION NODE #1',
    status: 'ONLINE',
    service: 'Smart Irrigation',
    price: 0.0001,
    minimumDelta: 50,
    device: 'Demo Device · Simulated',
    signer: '0xAa0A3DC02cDc7d5e2d108DabD096C1822bc0E8b8',
    serviceHash: '0x15f855c600d7ad49d2e3f53d29bf304db887e114d99057b7a40a94e8ed7acb26',
    currentReading: 67,
    lastProof: 'VERIFIED',
    jobsCompleted: 0,
    totalEarned: 0,
  },
  {
    id: 2,
    name: 'IRRIGATION NODE #2',
    status: 'ONLINE',
    service: 'Smart Irrigation',
    price: 0.0001,
    minimumDelta: 50,
    device: 'Demo Device · Simulated',
    signer: '0xBb0B3DC02cDc7d5e2d108DabD096C1822bc0E8b8',
    serviceHash: '0x25f855c600d7ad49d2e3f53d29bf304db887e114d99057b7a40a94e8ed7acb27',
    currentReading: 54,
    lastProof: 'VERIFIED',
    jobsCompleted: 1,
    totalEarned: 0.0001,
  },
]

export const mockJobs: Job[] = [
  {
    id: 3,
    machineId: 1,
    machineName: 'IRRIGATION NODE #1',
    status: 'WORKING',
    amount: 0.0001,
    service: 'Smart Irrigation',
    transaction: '0x0a00b2f8a9d6f5e8c7b9a5f2d8e1c4b7a9f6e5d2c8f1b4a7e3d6c9b2a5f8e1',
    createdAt: new Date('2026-09-29T08:00:00Z'),
    updatedAt: new Date('2026-09-29T08:06:00Z'),
  },
]

const mockProof: WorkProof = {
  received: true,
  signature: '0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1',
  beforeReading: 100,
  afterReading: 160,
  delta: 60,
  deviceSigner: '0xAa0A3DC02cDc7d5e2d108DabD096C1822bc0E8b8',
  timestamp: 1790668800,
  eip712: {
    domain: 'MachineMandi',
    version: '1',
    chainId: 91562037,
    verifyingContract: '0xac7F286057238bA05CC878A2d71dF265Fa1e9EEE',
    primaryType: 'WorkProof',
  },
}

export const mockActivities: Activity[] = [
  {
    id: '1',
    type: 'JOB_CREATED',
    jobId: 3,
    title: 'Job #3 created',
    description: 'Irrigation Node #1',
    metadata: { amount: '0.0001 MST', status: 'escrow funded' },
    timestamp: new Date('2026-09-29T08:00:00Z'),
  },
  {
    id: '2',
    type: 'DEVICE_CONNECTED',
    machineId: 1,
    title: 'Device connected',
    description: 'Irrigation Node #1',
    metadata: { status: 'ONLINE' },
    timestamp: new Date('2026-09-29T07:58:00Z'),
  },
]

export function getMachines(): Machine[] {
  return mockMachines
}

export function getMachine(id: number): Machine | undefined {
  return mockMachines.find((m) => m.id === id)
}

export function getJobs(): Job[] {
  return mockJobs
}

export function getJob(id: number): Job | undefined {
  const found = mockJobs.find((j) => j.id === id)
  if (found) return found
  return {
    id,
    machineId: 1,
    machineName: 'IRRIGATION NODE #1',
    status: 'OPEN',
    amount: 0.0001,
    service: 'Smart Irrigation',
    transaction: '0x' + Array(64).fill('0').join(''),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

export function registerRealJob(job: Job) {
  const existingIndex = mockJobs.findIndex(j => j.id === job.id)
  if (existingIndex >= 0) {
    mockJobs[existingIndex] = job
  } else {
    mockJobs.unshift(job)
  }

  mockActivities.unshift({
    id: String(mockActivities.length + 1),
    type: 'JOB_CREATED',
    jobId: job.id,
    title: `Job #${job.id} created`,
    description: job.machineName,
    metadata: { amount: `${job.amount} MST`, status: 'escrow funded' },
    timestamp: new Date(),
  })
}

export function getJobProof(jobId: number): WorkProof | null {
  const job = getJob(jobId)
  return job && job.status !== 'OPEN' ? mockProof : null
}

export function getActivities(): Activity[] {
  return mockActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

export function createJob(machineId: number): Job {
  const machine = getMachine(machineId)
  if (!machine) throw new Error('Machine not found')

  const newJob: Job = {
    id: mockJobs.length + 3,
    machineId,
    machineName: machine.name,
    status: 'OPEN',
    amount: machine.price,
    service: machine.service,
    transaction: '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join(''),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  mockJobs.push(newJob)

  mockActivities.unshift({
    id: String(mockActivities.length + 1),
    type: 'JOB_CREATED',
    jobId: newJob.id,
    title: `Job #${newJob.id} created`,
    description: machine.name,
    metadata: { amount: `${machine.price} MST`, status: 'escrow funded' },
    timestamp: new Date(),
  })

  return newJob
}
