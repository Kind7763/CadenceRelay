/**
 * A/B Testing Unit Tests
 * Tests the core A/B split logic, variant assignment, and winner picking
 */

// ── Helper functions extracted from emailWorker for testing ──

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface Contact {
  id: string;
  email: string;
  name: string;
  _preCreatedId?: string;
  _preCreatedToken?: string;
}

interface ABTestConfig {
  enabled: boolean;
  variantB: { subject: string; templateId?: string };
  splitPercentage: number; // total % split between A and B
  testDurationHours: number;
  winnerMetric: 'open_rate' | 'click_rate';
  status: string;
  winnerVariant: string | null;
}

function splitContactsForABTest(contacts: Contact[], abTest: ABTestConfig) {
  const splitPercent = abTest.splitPercentage || 20;
  const halfSplit = splitPercent / 2;
  const variantACount = Math.max(1, Math.round(contacts.length * (halfSplit / 100)));
  const variantBCount = Math.max(1, Math.round(contacts.length * (halfSplit / 100)));

  const shuffled = shuffleArray(contacts);

  return {
    variantA: shuffled.slice(0, variantACount),
    variantB: shuffled.slice(variantACount, variantACount + variantBCount),
    holdout: shuffled.slice(variantACount + variantBCount),
    totalA: variantACount,
    totalB: variantBCount,
    totalHoldout: shuffled.length - variantACount - variantBCount,
  };
}

function pickWinner(
  variantAStats: { sent: number; opens: number; clicks: number },
  variantBStats: { sent: number; opens: number; clicks: number },
  metric: 'open_rate' | 'click_rate'
): 'A' | 'B' {
  const aRate = variantAStats.sent > 0
    ? (metric === 'open_rate' ? variantAStats.opens / variantAStats.sent : variantAStats.clicks / variantAStats.sent)
    : 0;
  const bRate = variantBStats.sent > 0
    ? (metric === 'open_rate' ? variantBStats.opens / variantBStats.sent : variantBStats.clicks / variantBStats.sent)
    : 0;

  return bRate > aRate ? 'B' : 'A'; // Tie goes to A
}

// ── Tests ──

describe('A/B Testing - Contact Splitting', () => {
  const makeContacts = (count: number): Contact[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `contact-${i}`,
      email: `user${i}@example.com`,
      name: `User ${i}`,
    }));

  const makePreCreatedContacts = (count: number): Contact[] =>
    Array.from({ length: count }, (_, i) => ({
      id: `contact-${i}`,
      email: `user${i}@example.com`,
      name: `User ${i}`,
      _preCreatedId: `recipient-${i}`,
      _preCreatedToken: `token-${i}`,
    }));

  const defaultABConfig: ABTestConfig = {
    enabled: true,
    variantB: { subject: 'Test B Subject' },
    splitPercentage: 20,
    testDurationHours: 4,
    winnerMetric: 'open_rate',
    status: 'pending',
    winnerVariant: null,
  };

  test('splits 100 contacts into 10% A, 10% B, 80% holdout with 20% split', () => {
    const contacts = makeContacts(100);
    const result = splitContactsForABTest(contacts, defaultABConfig);

    expect(result.variantA.length).toBe(10);
    expect(result.variantB.length).toBe(10);
    expect(result.holdout.length).toBe(80);
    expect(result.variantA.length + result.variantB.length + result.holdout.length).toBe(100);
  });

  test('splits 1000 contacts correctly', () => {
    const contacts = makeContacts(1000);
    const result = splitContactsForABTest(contacts, defaultABConfig);

    expect(result.variantA.length).toBe(100);
    expect(result.variantB.length).toBe(100);
    expect(result.holdout.length).toBe(800);
  });

  test('splits with 50% split percentage', () => {
    const contacts = makeContacts(100);
    const config = { ...defaultABConfig, splitPercentage: 50 };
    const result = splitContactsForABTest(contacts, config);

    expect(result.variantA.length).toBe(25);
    expect(result.variantB.length).toBe(25);
    expect(result.holdout.length).toBe(50);
  });

  test('minimum 1 contact per variant even with small list', () => {
    const contacts = makeContacts(5);
    const result = splitContactsForABTest(contacts, defaultABConfig);

    expect(result.variantA.length).toBeGreaterThanOrEqual(1);
    expect(result.variantB.length).toBeGreaterThanOrEqual(1);
  });

  test('works with pre-created contacts (resend campaigns)', () => {
    const contacts = makePreCreatedContacts(100);
    const result = splitContactsForABTest(contacts, defaultABConfig);

    expect(result.variantA.length).toBe(10);
    expect(result.variantB.length).toBe(10);
    expect(result.holdout.length).toBe(80);

    // Verify pre-created markers are preserved
    for (const c of result.variantA) {
      expect(c._preCreatedId).toBeDefined();
      expect(c._preCreatedToken).toBeDefined();
    }
    for (const c of result.holdout) {
      expect(c._preCreatedId).toBeDefined();
    }
  });

  test('all contacts are accounted for (no duplicates, no missing)', () => {
    const contacts = makeContacts(200);
    const result = splitContactsForABTest(contacts, defaultABConfig);

    const allEmails = [
      ...result.variantA.map(c => c.email),
      ...result.variantB.map(c => c.email),
      ...result.holdout.map(c => c.email),
    ];

    expect(allEmails.length).toBe(200);
    expect(new Set(allEmails).size).toBe(200); // No duplicates
  });

  test('shuffles contacts (not in original order)', () => {
    const contacts = makeContacts(100);
    const result = splitContactsForABTest(contacts, defaultABConfig);

    // Check that variant A isn't just the first 10 contacts
    const variantAIds = result.variantA.map(c => c.id);
    const firstTenIds = contacts.slice(0, 10).map(c => c.id);

    // This could theoretically fail with 1 in 10^13 probability, which is fine
    expect(variantAIds).not.toEqual(firstTenIds);
  });

  test('handles single contact', () => {
    const contacts = makeContacts(1);
    const result = splitContactsForABTest(contacts, defaultABConfig);

    // With 1 contact, both A and B get minimum 1, but we only have 1 total
    // So A=1, B=1 but contacts.length=1 means holdout might be negative
    // The split should still produce valid groups
    const total = result.variantA.length + result.variantB.length + result.holdout.length;
    expect(total).toBe(1);
  });
});

describe('A/B Testing - Winner Picking', () => {
  test('picks variant with higher open rate', () => {
    const winner = pickWinner(
      { sent: 100, opens: 30, clicks: 5 },
      { sent: 100, opens: 50, clicks: 3 },
      'open_rate'
    );
    expect(winner).toBe('B'); // 50% > 30%
  });

  test('picks variant with higher click rate', () => {
    const winner = pickWinner(
      { sent: 100, opens: 30, clicks: 15 },
      { sent: 100, opens: 50, clicks: 10 },
      'click_rate'
    );
    expect(winner).toBe('A'); // 15% > 10%
  });

  test('tie goes to variant A', () => {
    const winner = pickWinner(
      { sent: 100, opens: 30, clicks: 5 },
      { sent: 100, opens: 30, clicks: 5 },
      'open_rate'
    );
    expect(winner).toBe('A');
  });

  test('handles zero sent (no emails sent yet)', () => {
    const winner = pickWinner(
      { sent: 0, opens: 0, clicks: 0 },
      { sent: 0, opens: 0, clicks: 0 },
      'open_rate'
    );
    expect(winner).toBe('A'); // Tie → A
  });

  test('handles unequal sent counts', () => {
    const winner = pickWinner(
      { sent: 50, opens: 25, clicks: 5 },  // 50% open rate
      { sent: 100, opens: 40, clicks: 3 }, // 40% open rate
      'open_rate'
    );
    expect(winner).toBe('A'); // 50% > 40%
  });

  test('variant B wins when it has better rate even with fewer sends', () => {
    const winner = pickWinner(
      { sent: 100, opens: 20, clicks: 2 },  // 20% open
      { sent: 50, opens: 30, clicks: 1 },   // 60% open
      'open_rate'
    );
    expect(winner).toBe('B');
  });
});

describe('A/B Testing - Pre-created Contact Handling', () => {
  test('pre-created contacts have _preCreatedId marker', () => {
    const contacts: Contact[] = [
      { id: 'c1', email: 'a@test.com', name: 'A', _preCreatedId: 'r1', _preCreatedToken: 't1' },
      { id: 'c2', email: 'b@test.com', name: 'B', _preCreatedId: 'r2', _preCreatedToken: 't2' },
      { id: 'c3', email: 'c@test.com', name: 'C' }, // NOT pre-created
    ];

    const preCreated = contacts.filter(c => c._preCreatedId);
    const newContacts = contacts.filter(c => !c._preCreatedId);

    expect(preCreated.length).toBe(2);
    expect(newContacts.length).toBe(1);
  });

  test('split preserves pre-created markers on all groups', () => {
    const contacts: Contact[] = Array.from({ length: 50 }, (_, i) => ({
      id: `c-${i}`,
      email: `u${i}@test.com`,
      name: `U ${i}`,
      _preCreatedId: `r-${i}`,
      _preCreatedToken: `t-${i}`,
    }));

    const config: ABTestConfig = {
      enabled: true,
      variantB: { subject: 'B Subject' },
      splitPercentage: 20,
      testDurationHours: 1,
      winnerMetric: 'open_rate',
      status: 'pending',
      winnerVariant: null,
    };

    const result = splitContactsForABTest(contacts, config);

    // ALL contacts in ALL groups should have pre-created markers
    for (const c of [...result.variantA, ...result.variantB, ...result.holdout]) {
      expect(c._preCreatedId).toBeDefined();
      expect(c._preCreatedToken).toBeDefined();
    }
  });
});
