import { NgModule } from '@angular/core';

import { declarations } from './foo.index';

@NgModule({
  declarations,
  exports: [declarations]
})
export class FooModule { }
