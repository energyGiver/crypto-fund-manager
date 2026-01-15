'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { apiClient, TaxReport } from '@/lib/api';

// Helper: Format amount with commas and 2 decimals
function formatAmount(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Helper: Color-coded amount text
function AmountText({ amount, className = '' }: { amount: string | number; className?: string }) {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  const colorClass = num > 0 ? 'text-blue-400' : num < 0 ? 'text-red-400' : 'text-zinc-400';
  return <span className={`${colorClass} ${className}`}>${formatAmount(amount)}</span>;
}

// Helper: Parse strategy body and apply colors to amounts
function StrategyBody({ text }: { text: string }) {
  // Split by sentences (. followed by space or end of string)
  const sentences = text.split(/\.\s+/).filter(s => s.trim());

  return (
    <div className="space-y-2 leading-relaxed">
      {sentences.map((sentence, idx) => {
        // Find dollar amounts in the sentence
        const parts = sentence.split(/(\$[\d,]+\.?\d*)/);

        return (
          <p key={idx} className="text-sm text-zinc-400">
            {parts.map((part, i) => {
              if (part.startsWith('$')) {
                const amount = part.substring(1).replace(/,/g, '');
                return <AmountText key={i} amount={amount} className="font-medium" />;
              }
              return <span key={i}>{part}</span>;
            })}
            {idx < sentences.length - 1 && '.'}
          </p>
        );
      })}
    </div>
  );
}

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;

  const [report, setReport] = useState<TaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showGainsOnly, setShowGainsOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

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

  // Filter logic for events and holdings
  let displayItems: any[] = [];

  if (selectedCategory === 'UNREALIZED') {
    // Show unrealized holdings
    const holdings = report.holdings || [];
    displayItems = holdings.map(h => ({
      ...h,
      category: 'UNREALIZED',
      timestamp: h.acquiredDate,
      txHash: h.acquiredTxHash,
    }));

    // If showGainsOnly is true, filter to only show positions with gains
    if (showGainsOnly) {
      displayItems = displayItems.filter(item => parseFloat(item.unrealizedGain) > 0);
    }
  } else {
    // Show tax events
    displayItems = selectedCategory === 'all'
      ? report.events
      : report.events.filter(e => e.category === selectedCategory);
  }

  // Pagination
  const totalPages = Math.ceil(displayItems.length / pageSize);
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;
  const paginatedItems = displayItems.slice(startIdx, endIdx);

  return (
    <div className="min-h-screen bg-black">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-900 via-black to-black">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent" />
      </div>

      {/* Content - Centered Container */}
      <div className="relative flex justify-center">
        <div className="w-full px-6 md:px-10 py-12" style={{ maxWidth: '1100px' }}>
          {/* Page Sections with Consistent Spacing */}
          <div className="space-y-8 md:space-y-10">

            {/* Section 1: Header */}
            <section>
              <button
                onClick={() => router.push('/')}
                className="text-zinc-400 hover:text-white mb-6 flex items-center gap-2 text-sm"
              >
                ← Back
              </button>
              <h1 className="text-4xl font-bold text-white mb-2">
                Tax Report {report.summary.year} for {report.summary.address}
              </h1>
            </section>

            {/* Section 2: KPI Cards */}
            <section>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6">
              <div className="space-y-3">
                <p className="text-sm text-zinc-500">Ordinary Income</p>
                <p className="text-3xl font-bold text-white">
                  ${formatAmount(report.summary.ordinaryIncome)}
                </p>
                <p className="text-xs text-zinc-600">
                  Airdrops & Staking
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <div className="space-y-3">
                <p className="text-sm text-zinc-500">Realized P&L</p>
                <p className="text-3xl font-bold text-white">
                  ${formatAmount(report.summary.capitalGainRealized)}
                </p>
                <div className="flex gap-2 text-xs">
                  <span className="text-zinc-600">
                    ST: ${formatAmount(report.summary.shortTermGain)}
                  </span>
                  <span className="text-zinc-600">
                    LT: ${formatAmount(report.summary.longTermGain)}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="space-y-3">
                <p className="text-sm text-zinc-500">Unrealized P&L</p>
                <p className="text-3xl font-bold text-white">
                  ${formatAmount(report.summary.capitalGainUnrealized)}
                </p>
                <p className="text-xs text-zinc-600">
                  Current Holdings
                </p>
              </div>
            </Card>

            <Card className="p-6 bg-blue-600/10 border-blue-600/20">
              <div className="space-y-3">
                <p className="text-sm text-blue-400">Estimated Tax Due</p>
                <p className="text-3xl font-bold text-blue-500">
                  ${formatAmount(report.summary.estimatedTaxDue)}
                </p>
                <p className="text-xs text-blue-400/60">
                  Based on {(report.summary.taxRates.ordinaryIncome * 100).toFixed(0)}% rate
                </p>
              </div>
            </Card>
              </div>
            </section>

            {/* Section 3: Tax-Saving Strategies */}
            {report.strategyCards && report.strategyCards.length > 0 && (
              <section className="w-full">
                <h2 className="text-2xl font-bold text-white mb-6">Tax-Saving Strategies</h2>
              <div className="space-y-6">
                {report.strategyCards.map((strategy, idx) => (
                  <Card
                    key={idx}
                    hover
                    className={`p-6 md:p-8 ${strategy.priority === 'high' ? 'border-blue-600/30' : ''}`}
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
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-white text-lg">{strategy.title}</h3>
                          {strategy.estimatedSavings && (
                            <span className="text-sm font-medium text-blue-500">
                              {strategy.estimatedSavings}
                            </span>
                          )}
                        </div>
                        <StrategyBody text={strategy.body} />
                        {strategy.actions && strategy.actions.length > 0 && (
                          <ul className="space-y-3 mt-4">
                            {strategy.actions.map((action, i) => {
                              const isUnrealizedLink = action.toLowerCase().includes('identify positions') ||
                                                       action.toLowerCase().includes('unrealized gains');

                              return (
                                <li key={i} className="flex items-start gap-3 text-sm leading-relaxed">
                                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  {isUnrealizedLink ? (
                                    <button
                                      onClick={() => {
                                        setSelectedCategory('UNREALIZED');
                                        setShowGainsOnly(true);
                                        setCurrentPage(1);
                                        // Scroll to transactions section
                                        document.querySelector('section:last-of-type')?.scrollIntoView({ behavior: 'smooth' });
                                      }}
                                      className="text-blue-400 hover:text-blue-300 underline cursor-pointer text-left"
                                    >
                                      {action}
                                    </button>
                                  ) : (
                                    <span className="text-zinc-500">{action}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              </section>
            )}

            {/* Section 4: Transactions */}
            <section>
              <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">Transactions</h2>
              <div className="flex gap-2 flex-wrap">
                {['all', 'DISPOSAL', 'AIRDROP', 'STAKING', 'TRANSFER', 'UNREALIZED'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setShowGainsOnly(false); // Reset gains filter when changing category
                      setCurrentPage(1);
                    }}
                    className={`
                      px-4 py-2 rounded-lg text-sm font-medium transition-all
                      ${selectedCategory === cat
                        ? 'bg-blue-600 text-white'
                        : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'
                      }
                    `}
                  >
                    {cat === 'all' ? 'All' : cat === 'UNREALIZED' ? 'Unrealized' : cat.charAt(0) + cat.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              </div>

              <div className="space-y-3 mt-4">
              {displayItems.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-zinc-500">No transactions found</p>
                </Card>
              ) : (
                paginatedItems.map((item) => (
                  <Card key={item.id} hover className="p-6">
                    {item.category === 'UNREALIZED' ? (
                      // Unrealized holding display
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap bg-purple-600/20 text-purple-400">
                            UNREALIZED
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white font-medium">
                              {item.tokenSymbol}
                            </div>
                            <p className="text-xs text-zinc-500 font-mono truncate">
                              {item.tokenAddress.slice(0, 8)}...{item.tokenAddress.slice(-6)}
                            </p>
                            <p className="text-xs text-zinc-600 mt-0.5">
                              {parseFloat(item.amount).toFixed(4)} tokens @ ${parseFloat(item.currentPrice).toFixed(6)}
                            </p>
                          </div>
                          <div className="hidden md:block text-xs text-zinc-600">
                            Acquired: {new Date(item.acquiredDate).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="text-right whitespace-nowrap">
                          <p className={`text-sm font-medium ${parseFloat(item.unrealizedGain) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            ${formatAmount(item.unrealizedGain)}
                          </p>
                          <p className="text-xs text-zinc-500">
                            Value: ${formatAmount(item.currentValue)}
                          </p>
                        </div>
                      </div>
                    ) : (
                      // Tax event display
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`
                            px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap
                            ${item.category === 'DISPOSAL' ? 'bg-red-600/20 text-red-400' : ''}
                            ${item.category === 'AIRDROP' ? 'bg-green-600/20 text-green-400' : ''}
                            ${item.category === 'STAKING' ? 'bg-blue-600/20 text-blue-400' : ''}
                            ${item.category === 'TRANSFER' ? 'bg-zinc-600/20 text-zinc-400' : ''}
                          `}>
                            {item.category}
                          </div>
                          <div className="flex-1 min-w-0">
                            <a
                              href={`https://etherscan.io/tx/${item.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-400 hover:text-blue-300 font-medium font-mono block truncate"
                            >
                              {item.txHash.slice(0, 10)}...{item.txHash.slice(-8)}
                            </a>
                            <p className="text-xs text-zinc-500">
                              {new Date(item.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                          {item.protocol && (
                            <span className="text-xs text-zinc-600 hidden md:block">{item.protocol}</span>
                          )}
                        </div>
                        <div className="text-right whitespace-nowrap">
                          {item.realizedGain && (
                            <p className={`text-sm font-medium ${parseFloat(item.realizedGain) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                              ${formatAmount(item.realizedGain)}
                            </p>
                          )}
                          {item.tokenInUsd && parseFloat(item.tokenInUsd) > 0 ? (
                            <p className="text-xs text-zinc-500">
                              ${formatAmount(item.tokenInUsd)}
                            </p>
                          ) : item.tokenInUsd && parseFloat(item.tokenInUsd) === 0 && item.category !== 'DISPOSAL' ? (
                            <p className="text-xs text-zinc-600">
                              —
                            </p>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </Card>
                ))
              )}
            </div>

            {/* Pagination */}
            {displayItems.length > pageSize && (
              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-zinc-500">
                  Showing {startIdx + 1}–{Math.min(endIdx, displayItems.length)} of {displayItems.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 rounded-lg text-sm font-medium bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ←
                  </button>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`
                            px-3 py-1 rounded-lg text-sm font-medium transition-all
                            ${currentPage === pageNum
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800'
                            }
                          `}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 rounded-lg text-sm font-medium bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    →
                  </button>
                </div>
              </div>
            )}
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
