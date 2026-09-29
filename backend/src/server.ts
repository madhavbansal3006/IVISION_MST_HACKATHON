import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { deviceRouter } from './device/deviceApi';
import { HealthResponse } from './types';
import { blockchainService } from './blockchain/contract';
import { mstBlockchainService } from './blockchain/mstContract';
import { jobCreatedListener } from './blockchain/listener';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

/**
 * GET /health
 * Extended health check reporting adapter mode, network parameters,
 * listener status, and relayer configuration.
 *
 * NOTE: Under NO circumstances is RELAYER_PRIVATE_KEY exposed.
 */
app.get('/health', async (_req: Request, res: Response): Promise<void> => {
  const relayerAddress = mstBlockchainService.getRelayerAddress();
  const relayerConfigured = Boolean(
    config.relayer.privateKey &&
      (config.relayer.rpcUrl || blockchainService.mode === 'mock')
  );

  const healthData: HealthResponse = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    blockchainAdapter: blockchainService.mode,
    listenerStatus: jobCreatedListener.isRunning() ? 'running' : 'stopped',
    relayerConfigured,
    chainId: config.relayer.chainId || 91562037,
    contractAddress: config.relayer.contractAddress || undefined,
    relayerAddress: relayerAddress || undefined,
    rpcConnected: blockchainService.mode === 'mock' ? true : Boolean(config.relayer.rpcUrl),
  };

  res.status(200).json(healthData);
});

// Device API routes
app.use('/api/device', deviceRouter);

// Global Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('[Relayer Service Error]:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal server error occurred',
  });
});

// 404 Handler
app.use((_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Start Server
if (process.env.NODE_ENV !== 'test' && require.main === module) {
  app.listen(config.port, async () => {
    console.log(`[MachineMandi Backend] Relayer running on http://localhost:${config.port}`);
    console.log(
      `[MachineMandi Backend] Blockchain Adapter: ${blockchainService.mode.toUpperCase()}`
    );
    console.log(
      `[MachineMandi Backend] Trust Rule: Backend does NOT hold device private keys.`
    );

    // Automatically start the blockchain event listener
    try {
      await jobCreatedListener.start();
    } catch (err: any) {
      console.error(
        '[MachineMandi Backend] Failed to start blockchain listener:',
        err.message
      );
    }
  });
}

export default app;
