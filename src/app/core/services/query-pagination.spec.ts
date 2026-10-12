import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersComponent } from '../../features/admin/users/admin-users.component';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './session-cleanup.service';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { environment } from '../../../environments/environment';

describe('T07B pagination and quota flow', () => {
  let http: HttpTestingController;
  const base=environment.apiUrl;
  beforeEach(()=> {
    sessionStorage.clear();
    TestBed.configureTestingModule({providers:[provideHttpClient(withInterceptors([authInterceptor])),provideHttpClientTesting(),provideRouter([])]});
    http=TestBed.inject(HttpTestingController);
  });
  afterEach(()=>{http.verify();TestBed.resetTestingModule();vi.restoreAllMocks();sessionStorage.clear();});
  const row=(id:number)=>({userId:id,fullName:`Synthetic ${id}`,username:`synthetic${id}`,role:'ESTUDIANTE',active:true});
  const page=(number:number,content:unknown[],total=55)=>({number,size:25,content,totalElements:total,totalPages:Math.ceil(total/25)});
  function users(pageNumber:number){return http.expectOne(r=>r.url===base+'/admin/users'&&r.params.get('page')===String(pageNumber));}
  function initialize(){
    const fixture=TestBed.createComponent(AdminUsersComponent);
    users(0).flush(page(0,[row(1),row(2)]));
    http.expectOne(base+'/admin/summary').flush({totalUsers:55,totalStudents:55});
    http.expectOne(base+'/admin/activity').flush({recentUsers:[],recentEvaluations:[],recentConcepts:[]});
    fixture.detectChanges();return fixture;
  }
  it('navigates from the rendered pager, keeps global metrics and resets search to page zero',()=>{
    const f=initialize();
    const next=Array.from(f.nativeElement.querySelectorAll('app-pagination button') as NodeListOf<HTMLButtonElement>).find(b=>b.textContent?.includes('Siguiente'))!;
    next.click();users(1).flush(page(1,[row(26)]));f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Página 2 de 3 · 55 registros');
    expect(f.componentInstance.summary()?.totalUsers).toBe(55);
    const search=f.nativeElement.querySelector('input[type="search"]') as HTMLInputElement;
    search.value='absent';search.dispatchEvent(new Event('input'));const request=users(0);
    expect(request.request.params.get('search')).toBe('absent');request.flush(page(0,[],0));f.detectChanges();
    expect(f.nativeElement.textContent).toContain('No hay usuarios con los filtros seleccionados');
    expect(f.componentInstance.summary()?.totalUsers).toBe(55);
  });
  it('ignores stale responses and displays the current server error',()=>{
    const f=initialize();f.componentInstance.changePage(1);const stale=users(1);
    f.componentInstance.changePage(2);users(2).flush(page(2,[row(51)]));
    stale.flush(page(1,[row(26)]));expect(f.componentInstance.users()[0].userId).toBe(51);
    f.componentInstance.changePage(1);users(1).flush({message:'Consulta temporalmente no disponible'},{status:503,statusText:'Unavailable'});
    f.detectChanges();expect(f.nativeElement.textContent).toContain('Consulta temporalmente no disponible');
  });
  it('keeps authentication and cleanup state after a storage quota rejection',()=>{
    const auth=TestBed.inject(AuthService);const cleanup=vi.spyOn(TestBed.inject(SessionCleanupService),'runAll');
    const token=`h.${btoa(JSON.stringify({exp:Date.now()/1000+600,userId:1}))}.s`;
    auth.login({usernameOrEmail:'synthetic',password:'fictitious'}).subscribe();
    http.expectOne(base+'/auth/login').flush({token,tokenType:'Bearer',userId:1,username:'synthetic',role:'DOCENTE',active:true,temporaryPassword:false});
    TestBed.inject(HttpClient).post(base+'/whiteboards/teacher',{}).subscribe({error:()=>{}});
    http.expectOne(base+'/whiteboards/teacher').flush({code:'STORAGE_QUOTA_EXCEEDED',message:'Se alcanzó la cuota'},{status:409,statusText:'Conflict'});
    expect(auth.getToken()).toBe(token);expect(cleanup).not.toHaveBeenCalled();
  });
});
