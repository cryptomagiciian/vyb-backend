import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ConfigService } from '@nestjs/config';

export function setupTracing() {
  const configService = new ConfigService();
  const otlpEndpoint = configService.get('OTEL_EXPORTER_OTLP_ENDPOINT');
  const serviceName = configService.get('OTEL_SERVICE_NAME', 'vyb-api');

  if (!otlpEndpoint) {
    console.warn('OTEL_EXPORTER_OTLP_ENDPOINT not set, tracing disabled');
    return;
  }

  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Disable file system instrumentation
        },
      }),
    ],
  });

  sdk.start();
  console.log('OpenTelemetry tracing initialized');
}
