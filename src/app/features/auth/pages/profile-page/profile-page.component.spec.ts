import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { AuthUser } from '../../../../core/auth/auth.models';
import { ProfilePageComponent } from './profile-page.component';

describe('ProfilePageComponent', () => {
  function setup(
    applyForListerApproval: ReturnType<typeof vi.fn>,
    currentUser: AuthUser = {
      id: 'renter-1',
      email: 'renter@example.com',
      fullName: 'Renter',
      role: 'user',
      listerStatus: 'none',
      isSuspended: false,
    },
  ) {
    TestBed.configureTestingModule({
      imports: [ProfilePageComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { has: () => false } } },
        },
        { provide: AuthService, useValue: { currentUser, applyForListerApproval } },
      ],
    });
    const fixture = TestBed.createComponent(ProfilePageComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, fixture };
  }

  it('shows account details read-only and preserves the lister request action', () => {
    const { fixture } = setup(vi.fn());
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Renter');
    expect(text).toContain('renter@example.com');
    expect(text).toContain('Request to Become an Apartment Lister');
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    expect(text).not.toContain('Save name');
  });

  it('submits a renter request through the existing auth service', async () => {
    const apply = vi.fn().mockResolvedValue(undefined);
    const { component, fixture } = setup(apply);
    await component.applyForLister();
    fixture.detectChanges();
    expect(apply).toHaveBeenCalledOnce();
    expect(component.listerSuccess()).toContain('pending admin approval');
    expect(component.isSubmittingListerRequest()).toBe(false);
  });

  it('shows pending without allowing a duplicate request', () => {
    const user: AuthUser = {
      id: 'renter-2',
      email: 'pending@example.com',
      fullName: 'Pending Renter',
      role: 'user',
      listerStatus: 'pending',
      isSuspended: false,
    };
    const { fixture } = setup(vi.fn(), user);
    expect(fixture.nativeElement.textContent).toContain('Request Pending');
    expect(fixture.nativeElement.textContent).not.toContain(
      'Request to Become an Apartment Lister',
    );
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });

  it('allows a rejected user to retry according to the existing workflow', () => {
    const user: AuthUser = {
      id: 'renter-3',
      email: 'rejected@example.com',
      fullName: 'Rejected Renter',
      role: 'user',
      listerStatus: 'rejected',
      isSuspended: false,
    };
    const { fixture } = setup(vi.fn(), user);
    expect(fixture.nativeElement.textContent).toContain('Previous request not approved');
    expect(fixture.nativeElement.querySelector('button')).not.toBeNull();
  });

  it('preserves approved status and suspension restrictions', () => {
    const user: AuthUser = {
      id: 'lister-1',
      email: 'lister@example.com',
      fullName: 'Approved Lister',
      role: 'lister',
      listerStatus: 'approved',
      isSuspended: true,
    };
    const { fixture } = setup(vi.fn(), user);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Lister Approved');
    expect(text).toContain('This account is suspended');
    expect(text).toContain('approval remains in place');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});
