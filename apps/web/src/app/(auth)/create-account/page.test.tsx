import { renderToStaticMarkup } from 'react-dom/server';
import CreateAccountPage from './page';

it('offers both account types before starting registration',async()=>{
 const html=renderToStaticMarkup(await CreateAccountPage({searchParams:Promise.resolve({next:'/saved'})}));
 expect(html).toContain('Student account');expect(html).toContain('Landlord account');
 expect(html).toContain('intent=student');expect(html).toContain('intent=landlord');
 expect(html.match(/screen=register/g)).toHaveLength(2);
 expect(html).toContain('next=%2Flandlords%2Fenroll');
 expect(html).toContain('next=%2Fsaved');
});
