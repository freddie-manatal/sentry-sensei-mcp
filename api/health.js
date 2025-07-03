export default function handler(req, res) {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    transport: 'mcp-vercel-adapter',
    protocolVersion: '2024-11-05',
    mode: 'serverless',
    version: '1.0.0',
  });
}
