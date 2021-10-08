import { NgModule } from '@angular/core';

import { declarations } from './bar.index';

@NgModule({
  declarations,
  exports: [declarations]
})
export class BarModule { }
