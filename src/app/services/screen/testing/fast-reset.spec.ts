import { TestBed } from '@angular/core/testing';
import { DEVICE_RESET_WAIT_MS } from '../serial-link.service';

/**
 * Every connection to the display starts with a RESET and a wait of about 5 s for it to come back. Tests would
 * spend minutes in that wait, so by default it is skipped here; the tests of the reset itself set their own wait.
 */
beforeEach(() => {
  TestBed.configureTestingModule({ providers: [{ provide: DEVICE_RESET_WAIT_MS, useValue: 0 }] });
});
