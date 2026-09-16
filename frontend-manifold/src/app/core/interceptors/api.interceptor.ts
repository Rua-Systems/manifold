import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const SKIP_API_INTERCEPTOR = new HttpContextToken<boolean>(() => false);

export const apiInterceptor: HttpInterceptorFn = (request, next) => {
	if (request.context.get(SKIP_API_INTERCEPTOR)) {
		return next(request);
	}
	if (!request.url.startsWith(environment.apiUrl)) {
		return next(request);
	}
	return next(request.clone({ withCredentials: true }));
};
