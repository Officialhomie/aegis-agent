import { Config } from '@remotion/cli/config';

Config.setEntryPoint('./src/index.ts');
Config.setOverwriteOutput(true);
// Increase timeout for headless render
Config.setDelayRenderTimeoutInMilliseconds(60000);
// Lower concurrency to avoid resource contention during render
Config.setConcurrency(2);
