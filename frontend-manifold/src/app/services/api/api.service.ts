import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
	private http = inject(HttpClient);
	private baseUrl = environment.apiUrl;

	get<T>(path: string, params?: HttpParams): Observable<T> {
		return this.http.get<T>(this.buildUrl(path), { params });
	}

	post<T, B>(path: string, body: B): Observable<T> {
		return this.http.post<T>(this.buildUrl(path), body);
	}

	put<T, B>(path: string, body: B): Observable<T> {
		return this.http.put<T>(this.buildUrl(path), body);
	}

	patch<T, B>(path: string, body: B): Observable<T> {
		return this.http.patch<T>(this.buildUrl(path), body);
	}

	delete<T>(path: string): Observable<T> {
		return this.http.delete<T>(this.buildUrl(path));
	}

	private buildUrl(path: string): string {
		return `${this.baseUrl}${path}`;
	}
}
