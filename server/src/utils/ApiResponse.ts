import { Response } from 'express';

export interface ApiResponseData<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}

export class ApiResponse {
  static success<T = any>(
    res: Response,
    data?: T,
    message?: string,
    statusCode: number = 200
  ) {
    const response: ApiResponseData<T> = {
      success: true,
      ...(message && { message }),
      ...(data !== undefined && { data }),
    };
    
    return res.status(statusCode).json(response);
  }

  static created<T = any>(res: Response, data?: T, message: string = 'Created') {
    return ApiResponse.success(res, data, message, 201);
  }

  static unauthorized(res: Response, message: string = 'Unauthorized') {
    return res.status(401).json({
      success: false,
      message,
    });
  }

  static noContent(res: Response) {
    return res.status(204).send();
  }
}
