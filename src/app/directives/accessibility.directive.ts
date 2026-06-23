import { Directive, ElementRef, HostListener, Input, OnInit } from '@angular/core';

/**
 * Directive to enhance accessibility (a11y) for buttons and interactive elements
 */
@Directive({
  selector: '[appA11y]',
  standalone: true
})
export class AccessibilityDirective implements OnInit {
  @Input() appA11yLabel?: string;
  @Input() appA11yRole?: string;
  @Input() appA11yAriaDescribedBy?: string;
  @Input() appA11yAriaLabel?: string;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    const element = this.el.nativeElement;

    // Set role if provided
    if (this.appA11yRole) {
      element.setAttribute('role', this.appA11yRole);
    }

    // Set aria-label if provided
    if (this.appA11yAriaLabel) {
      element.setAttribute('aria-label', this.appA11yAriaLabel);
    }

    // Set aria-describedby if provided
    if (this.appA11yAriaDescribedBy) {
      element.setAttribute('aria-describedby', this.appA11yAriaDescribedBy);
    }

    // Ensure buttons have proper keyboard handling
    if (element.tagName === 'BUTTON' && !element.hasAttribute('type')) {
      element.setAttribute('type', 'button');
    }

    // Add tabindex if not already present
    if (!element.hasAttribute('tabindex') && this.isInteractive(element)) {
      element.setAttribute('tabindex', '0');
    }
  }

  /**
   * Handle Enter key press for keyboard navigation
   */
  @HostListener('keydown.enter')
  onEnter(): void {
    const element = this.el.nativeElement;
    
    // Only for non-button elements that need activation
    if (element.tagName !== 'BUTTON' && element.tagName !== 'A') {
      element.click();
    }
  }

  /**
   * Check if element is interactive
   */
  private isInteractive(element: HTMLElement): boolean {
    const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'];
    return interactiveTags.includes(element.tagName);
  }
}

/**
 * Directive to add ARIA attributes to form controls
 */
@Directive({
  selector: '[appFormA11y]',
  standalone: true
})
export class FormAccessibilityDirective implements OnInit {
  @Input() appFormA11yId?: string;
  @Input() appFormA11yLabel?: string;
  @Input() appFormA11yError?: string;
  @Input() appFormA11yRequired?: boolean;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    const element = this.el.nativeElement;

    // Set ID if provided
    if (this.appFormA11yId) {
      element.id = this.appFormA11yId;
    }

    // Set aria-required if required
    if (this.appFormA11yRequired) {
      element.setAttribute('aria-required', 'true');
    }

    // Set aria-describedby for error messages
    if (this.appFormA11yError) {
      const errorId = `${this.appFormA11yId}-error`;
      element.setAttribute('aria-describedby', errorId);
      element.setAttribute('aria-invalid', 'true');
    }
  }
}

/**
 * Directive to enhance skip navigation
 */
@Directive({
  selector: '[appSkipNav]',
  standalone: true
})
export class SkipNavigationDirective {
  constructor(private el: ElementRef<HTMLElement>) {
    this.el.nativeElement.classList.add('sr-only');
    this.el.nativeElement.setAttribute('href', '#main-content');
  }
}
