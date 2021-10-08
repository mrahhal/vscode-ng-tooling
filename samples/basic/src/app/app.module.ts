import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { FooModule } from './foo/foo.module';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    FooModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
