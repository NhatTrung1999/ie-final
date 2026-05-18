import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';

function getErrorField(error: unknown, field: string) {
  if (!error || typeof error !== 'object' || !(field in error)) {
    return '';
  }

  const value = (error as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : '';
}

function isClientAbortError(error: unknown) {
  const message = getErrorField(error, 'message').toLowerCase();
  const code = getErrorField(error, 'code');
  const type = getErrorField(error, 'type');

  return (
    message === 'request aborted' ||
    message === 'upload aborted by client.' ||
    code === 'ECONNRESET' ||
    type === 'request.aborted'
  );
}

@Catch()
export class ClientAbortExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost) {
    if (!isClientAbortError(exception)) {
      super.catch(exception, host);
      return;
    }

    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    if (request.aborted || response.headersSent || response.writableEnded) {
      return;
    }

    response.status(499).json({
      statusCode: 499,
      error: 'Client Closed Request',
      message: 'The client closed the request before upload completed.',
    });
  }
}
