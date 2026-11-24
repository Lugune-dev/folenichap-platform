import { Injectable, computed, signal } from '@angular/core';
import { Lang } from './models';

type Dict = Record<string, string>;

const SW: Dict = {
  'app.tagline': 'Foleni bila kusimama',
  'common.save': 'Hifadhi', 'common.cancel': 'Ghairi', 'common.edit': 'Hariri', 'common.add': 'Ongeza',
  'common.loading': 'Inapakia…', 'common.minutes': 'dk', 'common.logout': 'Toka', 'common.back': 'Rudi',
  'common.active': 'Hai', 'common.inactive': 'Imezimwa', 'common.yes': 'Ndiyo', 'common.no': 'Hapana',
  'common.search': 'Tafuta', 'common.refresh': 'Onyesha upya', 'common.close': 'Funga', 'common.print': 'Chapisha',
  'auth.login': 'Ingia', 'auth.register': 'Jisajili', 'auth.email': 'Barua pepe', 'auth.password': 'Nenosiri',
  'auth.noAccount': 'Huna akaunti?', 'auth.haveAccount': 'Una akaunti tayari?', 'auth.business': 'Jina la biashara',
  'auth.owner': 'Jina lako', 'auth.phone': 'Namba ya simu', 'auth.slug': 'Kiungo cha biashara (hiari)',
  'auth.category': 'Aina ya biashara', 'auth.trial': 'Siku 14 za majaribio bure. Hakuna kadi inayohitajika.',
  'auth.pending': 'Usajili umepokelewa! Akaunti yako itawashwa baada ya kuidhinishwa.',
  'book.choose': 'Chagua huduma', 'book.name': 'Jina lako', 'book.phone': 'Namba ya simu (WhatsApp/SMS)',
  'book.join': 'Pata namba ya foleni', 'book.waiting': 'wanasubiri', 'book.wait': 'Kusubiri takriban',
  'book.fee': 'Ada ya huduma', 'book.payNow': 'Lipa sasa kwa simu', 'book.payRequired': 'Malipo yanahitajika kabla ya huduma',
  'book.network': 'Mtandao wa malipo', 'book.closed': 'Hatupokei tiketi kwa sasa. Tafadhali jaribu baadaye.',
  'book.free': 'Bure', 'book.branch': 'Tawi', 'book.privacy': 'Namba yako inatumika tu kukutumia taarifa za foleni.',
  'track.yourNumber': 'Namba yako', 'track.ahead': 'Watu mbele yako', 'track.eta': 'Muda wa kusubiri',
  'track.WAITING': 'Unasubiri', 'track.CALLED': 'Ni zamu yako! Nenda', 'track.SERVING': 'Unahudumiwa sasa',
  'track.COMPLETED': 'Huduma imekamilika. Asante!', 'track.NO_SHOW': 'Hukufika ulipoitwa. Tafadhali ongea na mapokezi.',
  'track.CANCELLED': 'Tiketi imeghairiwa.', 'track.cancel': 'Ghairi tiketi', 'track.cancelConfirm': 'Una uhakika unataka kughairi?',
  'track.live': 'Moja kwa moja', 'track.keepOpen': 'Acha ukurasa huu wazi — utapata taarifa zamu yako ikikaribia.',
  'track.pay': 'Lipa ada', 'track.pushSent': 'Angalia simu yako na uweke PIN kukamilisha malipo.',
  'track.pushFailed': 'Malipo hayakuanza. Jaribu tena.', 'track.share': 'Hifadhi kiungo hiki',
  'pay.UNPAID': 'Haijalipwa', 'pay.PENDING': 'Inasubiri malipo', 'pay.PAID': 'Imelipwa', 'pay.WAIVED': 'Imesamehewa',
  'status.WAITING': 'Anasubiri', 'status.CALLED': 'Ameitwa', 'status.SERVING': 'Anahudumiwa', 'status.COMPLETED': 'Amemaliza',
  'status.NO_SHOW': 'Hakufika', 'status.CANCELLED': 'Ameghairi',
  'tv.nowServing': 'Wanaohudumiwa sasa', 'tv.next': 'Wanaofuata', 'tv.waiting': 'Wanasubiri', 'tv.start': 'Bofya kuanza skrini (sauti itawashwa)',
  'tv.scan': 'Scan kupata namba', 'tv.goTo': 'nenda',
  'desk.callNext': 'Ita anayefuata', 'desk.recall': 'Ita tena', 'desk.start': 'Anza huduma', 'desk.complete': 'Maliza',
  'desk.noShow': 'Hakufika', 'desk.requeue': 'Rudisha foleni', 'desk.walkIn': 'Tiketi ya papo hapo', 'desk.counter': 'Dirisha / Chumba',
  'desk.current': 'Mteja wa sasa', 'desk.none': 'Hakuna mteja kwa sasa', 'desk.waitingList': 'Foleni', 'desk.done': 'Waliohudumiwa leo',
  'desk.filter': 'Huduma ninazotoa', 'desk.all': 'Zote', 'desk.waive': 'Samehe', 'desk.cash': 'Amelipa taslimu',
  'desk.empty': 'Hakuna anayesubiri', 'desk.shortcuts': 'Njia za mkato: N ita · R ita tena · S anza · C maliza',
  'desk.call': 'Ita', 'desk.issued': 'Tiketi imetolewa',
  'admin.dashboard': 'Muhtasari', 'admin.services': 'Huduma', 'admin.staff': 'Wafanyakazi', 'admin.branches': 'Matawi',
  'admin.payments': 'Malipo', 'admin.settings': 'Mipangilio', 'admin.desk': 'Dawati la foleni', 'admin.tv': 'Skrini ya TV',
  'kpi.tickets': 'Tiketi', 'kpi.completed': 'Waliohudumiwa', 'kpi.avgWait': 'Wastani wa kusubiri', 'kpi.avgService': 'Wastani wa huduma',
  'kpi.noShow': 'Kiwango cha kutofika', 'kpi.revenue': 'Mapato ya ada', 'kpi.peak': 'Saa za msongamano', 'kpi.staffPerf': 'Utendaji wa wafanyakazi',
  'kpi.byService': 'Kwa huduma', 'kpi.daily': 'Kila siku',
  'plan.trialEnds': 'Majaribio yanaisha', 'plan.upgrade': 'Lipia usajili', 'plan.credits': 'Salio la ujumbe',
  'admin.appointments': 'Miadi',
  'appt.now': 'Panga foleni sasa', 'appt.later': 'Weka miadi', 'appt.pickDay': 'Chagua siku', 'appt.pickTime': 'Chagua muda',
  'appt.noSlots': 'Hakuna nafasi siku hii. Jaribu siku nyingine.', 'appt.book': 'Thibitisha miadi', 'appt.today': 'Leo', 'appt.tomorrow': 'Kesho',
  'appt.BOOKED': 'Miadi imethibitishwa', 'appt.CHECKED_IN': 'Umejisajili', 'appt.CANCELLED': 'Miadi imeghairiwa', 'appt.NO_SHOW': 'Hukufika',
  'appt.checkIn': 'Nimefika — jisajili', 'appt.cancel': 'Ghairi miadi', 'appt.cancelConfirm': 'Una uhakika unataka kughairi miadi hii?',
  'appt.viewTicket': 'Fuatilia namba yako ya foleni', 'appt.closedNow': 'Tumefungwa kwa sasa, lakini unaweza kuweka miadi ya baadaye.',
  'appt.status.BOOKED': 'Imewekwa', 'appt.status.CHECKED_IN': 'Amefika', 'appt.status.CANCELLED': 'Imeghairiwa', 'appt.status.NO_SHOW': 'Hakufika',
  'auth.forgot': 'Umesahau nenosiri?'
};

const EN: Dict = {
  'app.tagline': 'Queue without standing',
  'common.save': 'Save', 'common.cancel': 'Cancel', 'common.edit': 'Edit', 'common.add': 'Add',
  'common.loading': 'Loading…', 'common.minutes': 'min', 'common.logout': 'Log out', 'common.back': 'Back',
  'common.active': 'Active', 'common.inactive': 'Inactive', 'common.yes': 'Yes', 'common.no': 'No',
  'common.search': 'Search', 'common.refresh': 'Refresh', 'common.close': 'Close', 'common.print': 'Print',
  'auth.login': 'Log in', 'auth.register': 'Create account', 'auth.email': 'Email', 'auth.password': 'Password',
  'auth.noAccount': 'No account yet?', 'auth.haveAccount': 'Already have an account?', 'auth.business': 'Business name',
  'auth.owner': 'Your name', 'auth.phone': 'Phone number', 'auth.slug': 'Business link (optional)',
  'auth.category': 'Business type', 'auth.trial': '14-day free trial. No card required.',
  'auth.pending': 'Registration received! Your account will be activated once approved.',
  'book.choose': 'Choose a service', 'book.name': 'Your name', 'book.phone': 'Phone number (WhatsApp/SMS)',
  'book.join': 'Get my queue number', 'book.waiting': 'waiting', 'book.wait': 'Approx. wait',
  'book.fee': 'Service fee', 'book.payNow': 'Pay now by mobile money', 'book.payRequired': 'Payment is required before service',
  'book.network': 'Payment network', 'book.closed': 'We are not accepting tickets right now. Please try later.',
  'book.free': 'Free', 'book.branch': 'Branch', 'book.privacy': 'Your number is only used to send you queue updates.',
  'track.yourNumber': 'Your number', 'track.ahead': 'People ahead', 'track.eta': 'Estimated wait',
  'track.WAITING': 'You are in the queue', 'track.CALLED': "It's your turn! Go to", 'track.SERVING': 'You are being served',
  'track.COMPLETED': 'Service completed. Thank you!', 'track.NO_SHOW': 'You missed your call. Please talk to reception.',
  'track.CANCELLED': 'Ticket cancelled.', 'track.cancel': 'Cancel ticket', 'track.cancelConfirm': 'Are you sure you want to cancel?',
  'track.live': 'Live', 'track.keepOpen': "Keep this page open — we'll alert you when your turn is near.",
  'track.pay': 'Pay fee', 'track.pushSent': 'Check your phone and enter your PIN to complete payment.',
  'track.pushFailed': 'Payment could not start. Try again.', 'track.share': 'Save this link',
  'pay.UNPAID': 'Unpaid', 'pay.PENDING': 'Payment pending', 'pay.PAID': 'Paid', 'pay.WAIVED': 'Waived',
  'status.WAITING': 'Waiting', 'status.CALLED': 'Called', 'status.SERVING': 'Serving', 'status.COMPLETED': 'Completed',
  'status.NO_SHOW': 'No-show', 'status.CANCELLED': 'Cancelled',
  'tv.nowServing': 'Now serving', 'tv.next': 'Up next', 'tv.waiting': 'Waiting', 'tv.start': 'Click to start the display (enables sound)',
  'tv.scan': 'Scan to join the queue', 'tv.goTo': 'go to',
  'desk.callNext': 'Call next', 'desk.recall': 'Recall', 'desk.start': 'Start service', 'desk.complete': 'Complete',
  'desk.noShow': 'No-show', 'desk.requeue': 'Back to queue', 'desk.walkIn': 'Walk-in ticket', 'desk.counter': 'Counter / Room',
  'desk.current': 'Current customer', 'desk.none': 'No active customer', 'desk.waitingList': 'Queue', 'desk.done': 'Served today',
  'desk.filter': 'Services I handle', 'desk.all': 'All', 'desk.waive': 'Waive', 'desk.cash': 'Paid cash',
  'desk.empty': 'Nobody waiting', 'desk.shortcuts': 'Shortcuts: N call next · R recall · S start · C complete',
  'desk.call': 'Call', 'desk.issued': 'Ticket issued',
  'admin.dashboard': 'Dashboard', 'admin.services': 'Services', 'admin.staff': 'Staff', 'admin.branches': 'Branches',
  'admin.payments': 'Payments', 'admin.settings': 'Settings', 'admin.desk': 'Queue desk', 'admin.tv': 'TV display',
  'kpi.tickets': 'Tickets', 'kpi.completed': 'Served', 'kpi.avgWait': 'Avg. wait', 'kpi.avgService': 'Avg. service',
  'kpi.noShow': 'No-show rate', 'kpi.revenue': 'Fee revenue', 'kpi.peak': 'Peak hours', 'kpi.staffPerf': 'Staff performance',
  'kpi.byService': 'By service', 'kpi.daily': 'Daily',
  'plan.trialEnds': 'Trial ends', 'plan.upgrade': 'Pay subscription', 'plan.credits': 'Message credits',
  'admin.appointments': 'Appointments',
  'appt.now': 'Join the queue now', 'appt.later': 'Book a time', 'appt.pickDay': 'Choose a day', 'appt.pickTime': 'Choose a time',
  'appt.noSlots': 'No free times on this day. Try another day.', 'appt.book': 'Confirm booking', 'appt.today': 'Today', 'appt.tomorrow': 'Tomorrow',
  'appt.BOOKED': 'Your appointment is booked', 'appt.CHECKED_IN': 'You are checked in', 'appt.CANCELLED': 'Appointment cancelled', 'appt.NO_SHOW': 'You missed this appointment',
  'appt.checkIn': "I'm here — check in", 'appt.cancel': 'Cancel appointment', 'appt.cancelConfirm': 'Are you sure you want to cancel this appointment?',
  'appt.viewTicket': 'Track your queue number', 'appt.closedNow': 'We are closed right now, but you can book a time for later.',
  'appt.status.BOOKED': 'Booked', 'appt.status.CHECKED_IN': 'Arrived', 'appt.status.CANCELLED': 'Cancelled', 'appt.status.NO_SHOW': 'No-show',
  'auth.forgot': 'Forgot password?'
};

const ERRORS: Record<Lang, Dict> = {
  sw: {
    INVALID_PHONE: 'Namba ya simu si sahihi. Mfano: 0712 345 678', RATE_LIMITED: 'Maombi mengi mno. Subiri dakika moja.',
    BAD_CREDENTIALS: 'Barua pepe au nenosiri si sahihi', EMAIL_TAKEN: 'Barua pepe hii tayari imesajiliwa',
    TENANT_INACTIVE: 'Biashara hii haipokei tiketi kwa sasa', OUTSIDE_HOURS: 'Tawi limefungwa kwa sasa',
    CLOSED_TODAY: 'Tawi limefungwa leo', PAYMENT_REQUIRED: 'Mteja hajalipa ada bado', PLAN_LIMIT: 'Umefikia kikomo cha mpango wako',
    PLAN_FEATURE: 'Kipengele hiki kinahitaji mpango wa Pro', NOT_FOUND: 'Haikupatikana', CONCURRENT_UPDATE: 'Imebadilishwa na mtu mwingine. Onyesha upya.',
    TENANT_SUSPENDED: 'Akaunti ya biashara imesimamishwa', PENDING_APPROVAL: 'Akaunti inasubiri kuidhinishwa',
    VALIDATION_FAILED: 'Tafadhali kagua taarifa ulizojaza', PREFIX_TAKEN: 'Herufi hii ya tiketi tayari inatumika',
    ACCOUNT_LOCKED: 'Majaribio mengi yameshindwa. Subiri dakika 15 kisha ujaribu tena.', INVALID_REFRESH: 'Muda wa kuingia umeisha. Ingia tena.',
    ALREADY_PAID: 'Tiketi hii tayari imelipwa', TICKET_CLOSED: 'Tiketi hii haipo hai tena', SELF_LOCKOUT: 'Huwezi kuzima akaunti yako mwenyewe',
    SLOT_FULL: 'Muda huu umechukuliwa sasa hivi. Chagua mwingine.', SLOT_UNAVAILABLE: 'Muda huu haupatikani. Chagua mwingine.',
    ALREADY_BOOKED: 'Namba hii tayari ina miadi ya huduma hii siku hiyo', NOT_BOOKABLE: 'Huduma hii haiwezi kuwekewa miadi',
    APPOINTMENT_CLOSED: 'Miadi hii haiwezi kubadilishwa tena', TOO_LATE_TO_CANCEL: 'Muda wa miadi umeshaanza',
    CHECK_IN_NOT_OPEN: 'Usajili unafunguliwa saa 1 kabla ya miadi yako', CHECK_IN_CLOSED: 'Muda wa kujisajili umepita. Ongea na mapokezi.',
    NOT_TODAY: 'Unaweza kusajili miadi ya leo tu', INVALID_RESET_CODE: 'Namba ya uthibitisho si sahihi au imeisha muda',
    NETWORK: 'Hakuna muunganisho na seva. Kagua intaneti yako kisha ujaribu tena.', SERVER_ERROR: 'Seva ina hitilafu kwa sasa. Jaribu tena baada ya muda mfupi.',
    FORBIDDEN: 'Huna ruhusa ya kufanya hili'
  },
  en: {
    INVALID_PHONE: 'Invalid phone number. Example: 0712 345 678', RATE_LIMITED: 'Too many requests. Wait a minute.',
    BAD_CREDENTIALS: 'Wrong email or password', EMAIL_TAKEN: 'This email is already registered',
    TENANT_INACTIVE: 'This business is not accepting tickets right now', OUTSIDE_HOURS: 'The branch is closed right now',
    CLOSED_TODAY: 'The branch is closed today', PAYMENT_REQUIRED: 'Customer has not paid the fee yet', PLAN_LIMIT: 'You have reached your plan limit',
    PLAN_FEATURE: 'This feature requires the Pro plan', NOT_FOUND: 'Not found', CONCURRENT_UPDATE: 'Changed by someone else. Refresh.',
    TENANT_SUSPENDED: 'This business account is suspended', PENDING_APPROVAL: 'Account awaiting approval',
    VALIDATION_FAILED: 'Please check the form', PREFIX_TAKEN: 'This ticket prefix is already in use',
    ACCOUNT_LOCKED: 'Too many failed attempts. Wait 15 minutes and try again.', INVALID_REFRESH: 'Your session expired. Please sign in again.',
    ALREADY_PAID: 'This ticket is already paid', TICKET_CLOSED: 'This ticket is no longer active', SELF_LOCKOUT: 'You cannot deactivate your own account',
    SLOT_FULL: 'This time was just taken. Please choose another.', SLOT_UNAVAILABLE: 'This time is not available. Please choose another.',
    ALREADY_BOOKED: 'This phone number already has a booking for this service that day', NOT_BOOKABLE: 'This service cannot be booked in advance',
    APPOINTMENT_CLOSED: 'This booking can no longer be changed', TOO_LATE_TO_CANCEL: 'The appointment time has already started',
    CHECK_IN_NOT_OPEN: 'Check-in opens 1 hour before your appointment', CHECK_IN_CLOSED: 'Check-in has closed. Please talk to reception.',
    NOT_TODAY: "Only today's appointments can be checked in", INVALID_RESET_CODE: 'The code is wrong or has expired',
    NETWORK: 'Cannot reach the server. Check your internet connection and try again.', SERVER_ERROR: 'The server had a problem. Please try again shortly.',
    FORBIDDEN: 'You are not allowed to do this'
  }
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly _lang = signal<Lang>(this.initial());
  readonly lang = this._lang.asReadonly();
  readonly isSw = computed(() => this._lang() === 'sw');

  /** Arrow function so it can be handed to templates directly: `t('key')`. */
  readonly t = (key: string): string => {
    const dict = this._lang() === 'sw' ? SW : EN;
    return dict[key] ?? EN[key] ?? key;
  };

  readonly error = (code: string | undefined, fallback?: string): string =>
    (code && ERRORS[this._lang()][code]) || fallback || (this._lang() === 'sw' ? 'Hitilafu imetokea' : 'Something went wrong');

  set(lang: Lang): void {
    this._lang.set(lang);
    try { localStorage.setItem('fc.lang', lang); } catch { /* private mode */ }
    document.documentElement.lang = lang;
  }

  toggle(): void { this.set(this._lang() === 'sw' ? 'en' : 'sw'); }

  /** Pick the Swahili or English variant of a bilingual field. */
  pick(sw: string | undefined | null, en: string | undefined | null): string {
    return (this._lang() === 'sw' ? (sw || en) : (en || sw)) ?? '';
  }

  private initial(): Lang {
    try {
      const saved = localStorage.getItem('fc.lang');
      if (saved === 'sw' || saved === 'en') return saved;
    } catch { /* ignore */ }
    return navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'sw';
  }
}
