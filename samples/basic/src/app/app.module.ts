import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { BarModule } from './foo/bar/bar.module';
import { FooModule } from './foo/foo.module';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    FooModule,
    BarModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
