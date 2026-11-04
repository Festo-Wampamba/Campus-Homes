import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { api, ApiError } from '@/lib/api';
import { OnboardingForm } from './onboarding-form';

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }) }));
jest.mock('../../lib/api', () => ({ ...jest.requireActual('../../lib/api'), api: jest.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('saves entries on an expired submit and returns through onboarding after sign-in', async () => {
  sessionStorage.clear();
  jest.mocked(api).mockRejectedValueOnce(new ApiError(401, { message: 'Unauthorized' }));
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<OnboardingForm userId="account-a" initialName="Jane Doe" initialUsername="sharedname" initialPhone="+256772123456" initialGender="female" askGender next="/dashboard" />));
    await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(container.textContent).toContain('Your session has ended.');
    expect(container.querySelector('a')?.getAttribute('href')).toContain('next=%2Fdashboard');
    expect(JSON.parse(sessionStorage.getItem('campushomes:onboarding:account-a')!)).toMatchObject({ name: 'Jane Doe', username: 'sharedname' });
    expect(sessionStorage.getItem('campushomes:onboarding:account-b')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  } finally { act(() => root.unmount()); container.remove(); sessionStorage.clear(); }
});

it('restores the visible phone field and clears only this account draft', async () => {
  sessionStorage.setItem('campushomes:onboarding:account-a', JSON.stringify({ name: 'Restored user', username: 'repeatable', phone: '+256772123456', gender: 'female' }));
  sessionStorage.setItem('campushomes:onboarding:account-b', 'other account');
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<OnboardingForm userId="account-a" initialName="" initialUsername="" initialPhone="" askGender next="/dashboard" />));
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Restore entries')!.click());
    expect(container.querySelector<HTMLInputElement>('#onboarding-phone')!.value).toBe('772123456');
    expect(container.querySelector<HTMLInputElement>('#onboarding-username')!.value).toBe('repeatable');
    expect(sessionStorage.getItem('campushomes:onboarding:account-a')).toBeNull();
    expect(sessionStorage.getItem('campushomes:onboarding:account-b')).toBe('other account');
  } finally { act(() => root.unmount()); container.remove(); sessionStorage.clear(); }
});

it('requires an account choice for a new native sign-up and submits landlord intent', async () => {
  sessionStorage.clear(); jest.mocked(api).mockReset().mockResolvedValueOnce({});
  const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
  try {
    await act(async()=>root.render(<OnboardingForm userId="new-signup" askAccountType initialName="New owner" initialUsername="repeatable" initialPhone="+256772123456" initialGender="male" askGender next="/" />));
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    await act(async()=>container.querySelector<HTMLInputElement>('input[value="landlord"]')!.click());
    await act(async()=>{container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
    expect(api).toHaveBeenCalledWith('/me/onboarding',expect.objectContaining({body:JSON.stringify({accountType:'landlord',name:'New owner',username:'repeatable',contactPhone:'+256772123456',gender:'male'})}));
  } finally {act(()=>root.unmount());container.remove();sessionStorage.clear();}
});
