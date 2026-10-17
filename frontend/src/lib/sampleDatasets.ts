/** Pre-packaged sample CSV datasets for instant one-click testing in AutoNexa. */

export interface SampleDataset {
  id: string;
  name: string;
  filename: string;
  taskType: "classification" | "regression";
  targetColumn: string;
  description: string;
  rowsCount: number;
  colsCount: number;
  csvContent: string;
}

export const SAMPLE_CHURN_CSV = `age,tenure_months,monthly_charges,total_charges,contract,tech_support,churn
34,12,65.5,786.0,month-to-month,no,yes
45,24,80.0,1920.0,one-year,yes,no
28,4,45.2,180.8,month-to-month,no,yes
52,60,105.3,6318.0,two-year,yes,no
61,8,75.1,600.8,month-to-month,no,yes
39,36,92.0,3312.0,one-year,yes,no
24,2,30.0,60.0,month-to-month,no,yes
58,48,98.5,4728.0,two-year,yes,no
42,18,70.2,1263.6,month-to-month,no,no
31,6,55.0,330.0,month-to-month,no,yes
67,72,112.5,8100.0,two-year,yes,no
29,14,60.0,840.0,month-to-month,yes,no
49,30,88.4,2652.0,one-year,no,no
36,10,68.0,680.0,month-to-month,no,yes
53,44,95.0,4180.0,two-year,yes,no
26,3,40.5,121.5,month-to-month,no,yes
47,28,82.0,2296.0,one-year,no,no
63,55,102.0,5610.0,two-year,yes,no
33,16,72.0,1152.0,month-to-month,no,yes
50,50,96.0,4800.0,two-year,yes,no
27,5,48.0,240.0,month-to-month,no,yes
44,22,78.5,1727.0,one-year,yes,no
56,40,91.0,3640.0,two-year,yes,no
38,15,69.0,1035.0,month-to-month,no,no
65,66,108.0,7128.0,two-year,yes,no
`;

export const SAMPLE_HOUSING_CSV = `sqft,bedrooms,bathrooms,age_years,distance_km,garage,price
1200,3,2,10,5.2,yes,280000
1650,4,2,5,8.0,yes,375000
850,2,1,25,2.1,no,195000
2100,4,3,3,12.5,yes,460000
1400,3,2,15,6.4,yes,310000
1850,4,2,8,9.2,yes,415000
950,2,1,30,1.8,no,220000
2400,5,3,2,15.0,yes,520000
1300,3,2,12,7.0,no,295000
1750,4,2,6,8.5,yes,390000
1100,2,1,18,4.5,yes,260000
2250,4,3,4,11.0,yes,490000
1550,3,2,9,7.8,yes,350000
900,2,1,28,2.5,no,205000
2000,4,3,7,10.2,yes,440000
1250,3,2,14,6.0,no,285000
1900,4,2,5,9.0,yes,425000
800,1,1,35,1.5,no,180000
2600,5,4,1,16.5,yes,570000
1450,3,2,11,7.2,yes,330000
`;

export const SAMPLE_FLIGHT_CSV = `carrier,distance_miles,dep_delay_min,day_of_week,scheduled_flight_time,delay_status
CarrierA,650,15,1,110,delayed
CarrierB,1200,-5,3,180,on_time
CarrierA,300,45,5,60,delayed
CarrierC,850,0,2,140,on_time
CarrierB,1500,-2,4,220,on_time
CarrierA,920,80,6,155,delayed
CarrierC,450,-10,7,85,on_time
CarrierB,780,5,2,130,on_time
CarrierA,1100,30,4,170,delayed
CarrierC,600,-4,1,105,on_time
CarrierB,1350,12,3,200,on_time
CarrierA,400,60,5,75,delayed
CarrierC,950,2,6,150,on_time
CarrierB,1600,-8,7,235,on_time
CarrierA,550,25,2,95,delayed
CarrierC,720,-1,4,120,on_time
CarrierB,1050,4,1,165,on_time
CarrierA,820,50,3,145,delayed
CarrierC,350,-6,5,70,on_time
CarrierB,1400,18,6,210,delayed
`;

export const SAMPLE_DATASETS: SampleDataset[] = [
  {
    id: "sample_churn",
    name: "Customer Churn",
    filename: "customer_churn.csv",
    taskType: "classification",
    targetColumn: "churn",
    description: "Telecom customer contract and usage records for binary churn classification.",
    rowsCount: 25,
    colsCount: 7,
    csvContent: SAMPLE_CHURN_CSV,
  },
  {
    id: "sample_housing",
    name: "Housing Price Index",
    filename: "housing_prices.csv",
    taskType: "regression",
    targetColumn: "price",
    description: "Residential properties with square footage, age, and location for price regression.",
    rowsCount: 20,
    colsCount: 7,
    csvContent: SAMPLE_HOUSING_CSV,
  },
  {
    id: "sample_flight",
    name: "Flight Delay Benchmark",
    filename: "flight_delays.csv",
    taskType: "classification",
    targetColumn: "delay_status",
    description: "Commercial airline departure flight records for delay status classification.",
    rowsCount: 20,
    colsCount: 6,
    csvContent: SAMPLE_FLIGHT_CSV,
  },
];
