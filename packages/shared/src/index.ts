// Pure domain logic shared by web and api. No I/O, no hardcoded figures:
// all numbers come from docs/data/*.json via loadData().
export const APP_NAME = 'CropCash';

export * from './money';
export * from './data';
export * from './subsidies';
export * from './farm';
