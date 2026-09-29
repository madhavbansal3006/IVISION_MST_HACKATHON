export interface Machine {
  id: number
  name: string
  status: 'ONLINE' | 'OFFLINE' | 'WORKING'
  service: string
  price: number
  minimumDelta: number
  device: string
  signer: string
  serviceHash: string
  currentReading: number
  lastProof?: string
  jobsCompleted: number
  totalEarned: number
}

export interface Job {
  id: number
  machineId: number
  machineName: string
  status: 'OPEN' | 'WORKING' | 'COMPLETED' | 'REFUNDED' | 'FAILED'
  amount: number
  service: string
  transaction?: string
  createdAt: Date
  updatedAt: Date
  proof?: WorkProof
}

export interface WorkProof {
  received: boolean
  signature: string
  beforeReading: number
  afterReading: number
  delta: number
  deviceSigner: string
  timestamp: number
  eip712: {
    domain: string
    version: string
    chainId: number
    verifyingContract: string
    primaryType: string
  }
}

export interface Activity {
  id: string
  type: 'JOB_CREATED' | 'JOB_WORKING' | 'PROOF_RECEIVED' | 'PROOF_VERIFIED' | 'SETTLEMENT_CONFIRMED' | 'DEVICE_CONNECTED'
  jobId?: number
  machineId?: number
  title: string
  description: string
  metadata?: Record<string, string | number>
  timestamp: Date
}

export interface NetworkConfig {
  name: string
  chainId: number
  testnet: boolean
  machineMandiContract: string
}
