import { IsString, IsInt, Min, Max, Matches, IsIn, IsOptional } from 'class-validator';

export class CreateReportDto {
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{40}$/, {
    message: 'Address must be a valid Ethereum address',
  })
  address: string;

  @IsInt()
  @Min(2015)
  @Max(2026)
  year: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number; // 1-12 for specific month, undefined/null for full year

  @IsString()
  @IsIn(['ethereum', 'sepolia'], {
    message: 'Network must be either ethereum or sepolia',
  })
  network: string;
}
