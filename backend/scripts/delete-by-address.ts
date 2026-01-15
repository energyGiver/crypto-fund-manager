import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

async function deleteByAddress(address: string) {
  try {
    const normalizedAddress = address.toLowerCase();
    console.log(`Deleting all reports for address ${normalizedAddress}`);

    const jobs = await prisma.job.findMany({
      where: { address: normalizedAddress },
    });

    console.log(`Found ${jobs.length} jobs for this address`);

    // Delete all jobs (cascade will handle Transaction, TaxEvent, and Report)
    for (const job of jobs) {
      console.log(`Deleting job: ${job.id}`);
      await prisma.job.delete({ where: { id: job.id } });
    }

    // Also delete cost lots for this address
    const costLotResult = await prisma.costLot.deleteMany({
      where: { address: normalizedAddress }
    });

    console.log(`Deleted ${jobs.length} reports and ${costLotResult.count} cost lots for address ${normalizedAddress}`);
    console.log('✓ All data deleted successfully!');
  } catch (error) {
    console.error('Error deleting data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get address from command line argument
const address = process.argv[2];

if (!address) {
  console.error('Usage: ts-node scripts/delete-by-address.ts <address>');
  process.exit(1);
}

deleteByAddress(address);
