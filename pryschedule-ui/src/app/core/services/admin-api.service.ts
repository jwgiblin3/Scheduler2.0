import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  FieldGroupListItem, FieldGroupDetail, FieldGroupVersionSummary,
  CreateFieldGroupRequest, UpdateFieldGroupRequest,
  AuditLogPage, AuditLogQuery
} from '../models/admin-models';

/**
 * Admin-only API surface. Server-side endpoints live under
 * <c>/api/admin/...</c> and are gated by the SuperAdmin / ManageGlobals
 * authorization policies. The Angular auth interceptor attaches the JWT
 * automatically; we don't need to do anything special here.
 */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly base = `${environment.apiUrl}/admin`;

  constructor(private http: HttpClient) {}

  // ---- Field groups ----

  listFieldGroups(opts?: { category?: string; includeDeleted?: boolean }) {
    let params = new HttpParams();
    if (opts?.category) params = params.set('category', opts.category);
    if (opts?.includeDeleted) params = params.set('includeDeleted', 'true');
    return this.http.get<FieldGroupListItem[]>(`${this.base}/field-groups`, { params });
  }

  getFieldGroup(logicalId: string) {
    return this.http.get<FieldGroupDetail>(`${this.base}/field-groups/${logicalId}`);
  }

  getFieldGroupVersions(logicalId: string) {
    return this.http.get<FieldGroupVersionSummary[]>(
      `${this.base}/field-groups/${logicalId}/versions`);
  }

  createFieldGroup(body: CreateFieldGroupRequest) {
    return this.http.post<FieldGroupDetail>(`${this.base}/field-groups`, body);
  }

  updateFieldGroup(logicalId: string, body: UpdateFieldGroupRequest) {
    return this.http.put<FieldGroupDetail>(
      `${this.base}/field-groups/${logicalId}`, body);
  }

  deleteFieldGroup(logicalId: string) {
    return this.http.delete(`${this.base}/field-groups/${logicalId}`);
  }

  // ---- Audit log ----

  listAuditLog(q?: AuditLogQuery) {
    let params = new HttpParams();
    if (q?.action !== undefined)     params = params.set('action', String(q.action));
    if (q?.entityType)               params = params.set('entityType', q.entityType);
    if (q?.userId !== undefined)     params = params.set('userId', String(q.userId));
    if (q?.practiceId !== undefined) params = params.set('practiceId', String(q.practiceId));
    if (q?.from)                     params = params.set('from', q.from);
    if (q?.to)                       params = params.set('to', q.to);
    if (q?.page !== undefined)       params = params.set('page', String(q.page));
    if (q?.pageSize !== undefined)   params = params.set('pageSize', String(q.pageSize));
    return this.http.get<AuditLogPage>(`${this.base}/audit`, { params });
  }
}
