const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function deleteReport(jobId) {
  try {
    console.log(`Deleting report with Job ID: ${jobId}`);

    // First, get the job to find the address
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      console.log(`Job ${jobId} not found`);
      return;
    }

    console.log(`Found job for address: ${job.address}`);

    // Delete cost lots for this address
    // Note: CostLots are shared across all jobs for an address, so we'll only delete if explicitly needed
    // For now, let's just delete the job which will cascade delete transactions, tax events, and report

    // Delete the job (will cascade delete transactions, taxEvents, and report)
    await prisma.job.delete({
      where: { id: jobId },
    });

    console.log(`Deleted job: ${job.id}`);
    console.log('✓ Report deleted successfully! (Transactions, TaxEvents, and Report were cascade deleted)');
  } catch (error) {
    console.error('Error deleting report:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

// Get job ID from command line argument
const jobId = process.argv[2];

if (!jobId) {
  console.error('Usage: node scripts/delete-report.js <job-id>');
  process.exit(1);
}

deleteReport(jobId);
