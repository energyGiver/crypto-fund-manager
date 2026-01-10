'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { apiClient, TaxReport } from '@/lib/api';

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [report, setReport] = useState<TaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const data = await apiClient.getReport(jobId);
        setReport(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading report...</div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <Card className="p-8 max-w-md text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Error</h1>
          <p className="text-zinc-400 mb-6">{error || 'Report not found'}</p>
          <Button onClick={() => router.push('/')}>Back to Home</Button>
        </Card>
      </div>
    );
  }

  const filteredEvents = selectedCategory === 'all'
    ? report.events
    : report.events.filter(e => e.category === selectedCategory);

  return (
    <div className="min-h-screen bg-black">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-900 via-black to-black">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="relative">
        <div className="mx-auto max-w-7xl px-6 py-12">
          {/* Header */}
          <div className="mb-12">
            <button
              onClick={() => router.push('/')}
              className="text-zinc-400 hover:text-white mb-4 flex items-center gap-2 text-sm"
            >
              ← Back
            </button>
            <h1 className="text-4xl font-bold text-white mb-2">
              Tax Report {report.summary.year}
            </h1>
            <p className="text-zinc-400 font-mono text-sm">
              {report.summary.address}
            </p>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <Card>
              <div className="space-y-2">
                <p className="text-sm text-zinc-500">Ordinary Income</p>
                <p className="text-3xl font-bold text-white">
                  ${parseFloat(report.summary.ordinaryIncome).toLocaleString()}
                </p>
                <p className="text-xs text-zinc-600">
                  Airdrops & Staking
                </p>
              </div>
            </Card>

            <Card>
              <div className="space-y-2">
                <p className="text-sm text-zinc-500">Realized P&L</p>
                <p className="text-3xl font-bold text-white">
                  ${parseFloat(report.summary.capitalGainRealized).toLocaleString()}
                </p>
                <div className="flex gap-2 text-xs">
                  <span className="text-zinc-600">
                    ST: ${parseFloat(report.summary.shortTermGain).toLocaleString()}
                  </span>
                  <span className="text-zinc-600">
                    LT: ${parseFloat(report.summary.longTermGain).toLocaleString()}
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <div className="space-y-2">
                <p className="text-sm text-zinc-500">Gas Fees Paid</p>
                <p className="text-3xl font-bold text-white">
                  ${parseFloat(report.summary.totalGasFee).toLocaleString()}
                </p>
                <p className="text-xs text-zinc-600">
                  Deductible
                </p>
              </div>
            </Card>

            <Card className="bg-blue-600/10 border-blue-600/20">
              <div className="space-y-2">
                <p className="text-sm text-blue-400">Estimated Tax Due</p>
                <p className="text-3xl font-bold text-blue-500">
                  ${parseFloat(report.summary.estimatedTaxDue).toLocaleString()}
                </p>
                <p className="text-xs text-blue-400/60">
                  Based on {(report.summary.taxRates.ordinaryIncome * 100).toFixed(0)}% rate
                </p>
              </div>
            </Card>
          </div>

          {/* Strategy Cards */}
          {report.strategyCards && report.strategyCards.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-6">Tax-Saving Strategies</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {report.strategyCards.map((strategy, idx) => (
                  <Card
                    key={idx}
                    hover
                    className={`
                      ${strategy.priority === 'high' ? 'border-blue-600/30' : ''}
                    `}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`
                        w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0
                        ${strategy.priority === 'high' ? 'bg-blue-600/20' : 'bg-zinc-800'}
                      `}>
                        <svg className="w-6 h-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold text-white">{strategy.title}</h3>
                          {strategy.estimatedSavings && (
                            <span className="text-sm font-medium text-blue-500">
                              {strategy.estimatedSavings}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 mb-4">{strategy.body}</p>
                        {strategy.actions && strategy.actions.length > 0 && (
                          <ul className="space-y-2">
                            {strategy.actions.map((action, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-zinc-500">
                                <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                {action}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Transactions */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Transactions</h2>
              <div className="flex gap-2">
                {['all', 'DISPOSAL', 'AIRDROP', 'STAKING', 'TRANSFER'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`
                      px-4 py-2 rounded-lg text-sm font-medium transition-all
                      ${selectedCategory === cat
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'
                      }
                    `}
                  >
                    {cat === 'all' ? 'All' : cat.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {filteredEvents.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-zinc-500">No transactions found</p>
                </Card>
              ) : (
                filteredEvents.slice(0, 20).map((event) => (
                  <Card key={event.id} hover className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`
                          px-3 py-1 rounded-full text-xs font-medium
                          ${event.category === 'DISPOSAL' ? 'bg-red-600/20 text-red-400' : ''}
                          ${event.category === 'AIRDROP' ? 'bg-green-600/20 text-green-400' : ''}
                          ${event.category === 'STAKING' ? 'bg-blue-600/20 text-blue-400' : ''}
                          ${event.category === 'TRANSFER' ? 'bg-zinc-600/20 text-zinc-400' : ''}
                        `}>
                          {event.category}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-white font-medium font-mono">
                            {event.txHash.slice(0, 10)}...{event.txHash.slice(-8)}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {new Date(event.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                        {event.protocol && (
                          <span className="text-xs text-zinc-600">{event.protocol}</span>
                        )}
                      </div>
                      <div className="text-right">
                        {event.realizedGain && (
                          <p className={`text-sm font-medium ${parseFloat(event.realizedGain) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ${parseFloat(event.realizedGain).toFixed(2)}
                          </p>
                        )}
                        {event.tokenInUsd && (
                          <p className="text-xs text-zinc-500">
                            ${parseFloat(event.tokenInUsd).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>

            {filteredEvents.length > 20 && (
              <p className="text-center text-sm text-zinc-500 mt-6">
                Showing 20 of {filteredEvents.length} transactions
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
