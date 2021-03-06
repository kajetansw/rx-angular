import { Directive, ElementRef, Input, OnInit, Optional } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { filter, map, mergeAll, tap, withLatestFrom } from 'rxjs/operators';
import { LetDirective } from '@rx-angular/template';

function intersectionObserver(
  options?: object
): {
  observe: (target: Element) => void;
  unobserve: (target: Element) => void;
  entries$: Observable<any>;
} {
  const subject = new Subject();
  const observer = observerSupported()
    ? new IntersectionObserver(entries => {
        entries.forEach(entry => subject.next(entry));
      }, options)
    : null;

  const entries$ = new Observable(subscriber => {
    subject.subscribe(subscriber);
    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  });

  return {
    entries$,
    observe: observer.observe,
    unobserve: observer.unobserve
  };
}

const observerSupported = () =>
  typeof window !== 'undefined'
    ? !!(window as any).IntersectionObserver
    : false;

@Directive({
  // tslint:disable-next-line:directive-selector
  selector: '[viewport-prio]'
})
export class RenderPrioDirective implements OnInit {
  entriesSubject = new Subject<IntersectionObserverEntry[]>();
  entries$: Observable<IntersectionObserverEntry> = this.entriesSubject.pipe(
    mergeAll()
  );

  _viewportPrio = 'noop';
  @Input('viewport-prio')
  set viewportPrio(prio) {
    if (prio) {
      this._viewportPrio = prio || 'noop';
    }
  }

  private observer: IntersectionObserver | null = observerSupported()
    ? new IntersectionObserver(entries => this.entriesSubject.next(entries), {
        threshold: 0
      })
    : null;

  visibilityEvents$ = this.entries$.pipe(
    map(entry => {
      if (entry.intersectionRatio > 0) {
        return 'visible';
      } else {
        return 'invisible';
      }
    })
  );

  constructor(
    private readonly el: ElementRef,
    @Optional() private letDirective: LetDirective<any>
  ) {
    console.log('PRIO');
  }

  ngOnInit() {
    const letStrategyName$ = this.letDirective.renderAware.activeStrategy$.pipe(
      map(s => s.name),
      filter(name => name !== this._viewportPrio)
    );

    this.observer.observe(this.el.nativeElement);

    this.visibilityEvents$
      .pipe(
        withLatestFrom(letStrategyName$),
        map(([visibility, strategyName]) =>
          visibility === 'visible' ? strategyName : this._viewportPrio
        )
      )
      .subscribe(strategyName => {
        this.letDirective.strategy = strategyName;
        console.log('switched to ', strategyName);

        // render actual state on viewport enter
        this.letDirective.strategies[strategyName].scheduleCD();

        //
        this.el.nativeElement.classList.add(strategyName);
      });
  }
}
