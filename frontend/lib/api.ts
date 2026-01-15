const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface CreateReportRequest {
  address: string;
  year: number;
  month?: number; // 1-12 for specific month, undefined for full year
  network: string;
}

export interface CreateReportResponse {
  jobId: string;
}

export interface JobStatus {
  jobId: string;
  stage: 'PENDING' | 'FETCHING_TX' | 'CLASSIFYING' | 'PRICING' | 'CALCULATING' | 'DONE' | 'ERROR';
  progressPct: number;
  etaHint: string | null;
  errors: any | null;
}

export interface TaxReport {
  status: string;
  summary: {
    address: string;
    year: number;
    network: string;
    ordinaryIncome: string;
    capitalGainRealized: string;
    capitalGainUnrealized: string;
    shortTermGain: string;
    longTermGain: string;
    totalGasFee: string;
    estimatedTaxDue: string;
    taxRates: {
      ordinaryIncome: number;
      shortTermCg: number;
      longTermCg: number;
    };
  };
  strategyCards: Array<{
    title: string;
    body: string;
    estimatedSavings?: string;
    priority: 'high' | 'medium' | 'low';
    actions?: string[];
  }>;
  events: Array<{
    id: string;
    txHash: string;
    timestamp: string;
    category: string;
    tokenIn?: string;
    tokenInAmount?: string;
    tokenInUsd?: string;
    tokenOut?: string;
    tokenOutAmount?: string;
    tokenOutUsd?: string;
    gasFeeUsd?: string;
    realizedGain?: string;
    protocol?: string;
    notes?: string;
  }>;
  holdings: Array<{
    id: string;
    tokenSymbol: string;
    tokenAddress: string;
    amount: string;
    costBasis: string;
    currentValue: string;
    unrealizedGain: string;
    currentPrice: string;
    acquiredDate: string;
    acquiredTxHash: string;
  }>;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async createReport(data: CreateReportRequest): Promise<CreateReportResponse> {
    const response = await fetch(`${this.baseUrl}/api/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create report');
    }

    return response.json();
  }

  async getJobStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`${this.baseUrl}/api/report/${jobId}/status`);

    if (!response.ok) {
      throw new Error('Failed to fetch job status');
    }

    return response.json();
  }

  async getReport(jobId: string): Promise<TaxReport> {
    const response = await fetch(`${this.baseUrl}/api/report/${jobId}/result`);

    if (!response.ok) {
      throw new Error('Failed to fetch report');
    }

    return response.json();
  }
}

export const apiClient = new ApiClient();
