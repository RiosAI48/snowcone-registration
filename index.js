require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');

const app = express();
const PORT = process.env.PORT || 3002;

const resend = new Resend(process.env.RESEND_API_KEY);

const REGISTRATIONS_FILE = path.join(__dirname, 'registrations.json');
const REMINDERS_FILE = path.join(__dirname, 'reminders-sent.json');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Data helpers ----------

function readRegistrations() {
  let raw;
  try {
    raw = fs.readFileSync(REGISTRATIONS_FILE, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    writeRegistrations([]);
    return [];
  }
  return raw.trim() ? JSON.parse(raw) : [];
}

function writeRegistrations(registrations) {
  fs.writeFileSync(REGISTRATIONS_FILE, JSON.stringify(registrations, null, 2));
}

function readReminders() {
  let raw;
  try {
    raw = fs.readFileSync(REMINDERS_FILE, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    writeReminders({});
    return {};
  }
  return raw.trim() ? JSON.parse(raw) : {};
}

function writeReminders(reminders) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2));
}

function generateRegistrationNumber(registrations) {
  const count = registrations.length + 1;
  return `FFF-${String(count).padStart(3, '0')}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatEventDate() {
  const [year, month, day] = process.env.EVENT_DATE.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${weekday} ${monthDay}, ${year}`;
}

const EVENT_MAPS_LINK = 'https://maps.google.com/?q=422+Melton+St+Magnolia+TX+77354';

// ---------- Email templates ----------

function emailWrapper(bodyHtml) {
  return `
  <div style="font-family: Georgia, 'Times New Roman', serif; background-color: #FDF6EC; padding: 32px 16px; margin: 0;">
    <div style="max-width: 560px; margin: 0 auto; background-color: #FFFBF5; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(139, 38, 53, 0.12);">
      <div style="background: linear-gradient(135deg, #D4561A, #8B2635); padding: 28px 24px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 8px;">🍂🍁🦃🌾</div>
        <div style="color: #FFFBF5; font-size: 22px; font-weight: bold;">${process.env.EVENT_NAME}</div>
      </div>
      <div style="padding: 28px 24px; color: #3D2010; font-size: 16px; line-height: 1.6;">
        ${bodyHtml}
      </div>
      <div style="padding: 18px 24px; text-align: center; background-color: #FDF6EC; color: #8B7355; font-size: 12px;">
        Powered by RiosAI Automations
      </div>
    </div>
  </div>`;
}

function detailsBox() {
  const [venueName, ...addressParts] = process.env.EVENT_LOCATION.split(',');
  const address = addressParts.join(',').trim();

  return `
  <div style="background-color: #FDF6EC; border-left: 4px solid #D4561A; border-radius: 8px; padding: 16px 20px; margin: 18px 0;">
    <div style="margin-bottom: 6px;"><strong>Date:</strong> ${formatEventDate()}</div>
    <div style="margin-bottom: 6px;"><strong>Time:</strong> ${process.env.EVENT_TIME}</div>
    <div><strong>Location:</strong> ${venueName.trim()}<br/>
    <a href="${EVENT_MAPS_LINK}" style="color: #D4561A;">${address}</a></div>
  </div>`;
}

function menuBox() {
  const items = [
    '🥔 Mashed Potatoes',
    '🥩 Beef Tips & Gravy',
    '🫛 Green Beans',
    '🥐 Homemade Biscuits',
    '🍰 Homemade Dessert'
  ];
  const itemsHtml = items
    .map((item, i) => `<div style="padding: 7px 0; ${i < items.length - 1 ? 'border-bottom: 1px solid #F0E4D3;' : ''} font-size: 15px;">${item}</div>`)
    .join('');

  return `
  <div style="background-color: #FFFBF5; border: 1px solid #E8D9C5; border-radius: 8px; padding: 16px 20px; margin: 18px 0;">
    <div style="color: #D4561A; font-weight: bold; font-size: 17px; margin-bottom: 8px;">What's on the Menu 🍽️</div>
    ${itemsHtml}
  </div>`;
}

function confirmationEmailHtml(registration) {
  const specialRequestsRow = registration.specialRequests
    ? `<div style="margin-bottom: 6px;"><strong>Special requests:</strong> ${registration.specialRequests}</div>`
    : '';

  const body = `
    <p style="font-size: 18px;">Hi ${registration.firstName}!</p>
    <p>You're officially on the list for <strong>${process.env.EVENT_NAME}</strong>. We're so glad you'll be joining us!</p>
    <p style="text-align: center; padding: 14px 4px 18px;">Come hungry and leave full! 🦃🍂 Join us for a delicious homemade Thanksgiving meal. Gather around the table with family and friends or grab a meal to go! ❤️🍽️</p>
    ${detailsBox()}
    ${menuBox()}
    <div style="background-color: #FFFBF5; border: 1px solid #E8D9C5; border-radius: 8px; padding: 16px 20px; margin: 18px 0;">
      <div style="margin-bottom: 6px;"><strong>Registration number:</strong> ${registration.registrationNumber}</div>
      <div style="margin-bottom: 6px;"><strong>Party size:</strong> ${registration.partySize}</div>
      ${specialRequestsRow}
    </div>
    <p style="text-align: center; padding-top: 6px;">Good food, great company and a whole lot of Thanksgiving love! 🧡 We can't wait to see you there!</p>
  `;
  return emailWrapper(body);
}

function adminNotificationHtml(registration, totalRegistrations, totalAttendees) {
  const specialRequestsRow = registration.specialRequests
    ? `<div style="margin-bottom: 6px;"><strong>Special requests:</strong> ${registration.specialRequests}</div>`
    : '<div style="margin-bottom: 6px;"><strong>Special requests:</strong> None</div>';

  const body = `
    <p style="font-size: 18px;">New registration received!</p>
    <div style="background-color: #FDF6EC; border-radius: 8px; padding: 16px 20px; margin: 18px 0;">
      <div style="margin-bottom: 6px;"><strong>Name:</strong> ${registration.firstName} ${registration.lastName}</div>
      <div style="margin-bottom: 6px;"><strong>Email:</strong> ${registration.email}</div>
      <div style="margin-bottom: 6px;"><strong>Phone:</strong> ${registration.phone}</div>
      <div style="margin-bottom: 6px;"><strong>Party size:</strong> ${registration.partySize}</div>
      ${specialRequestsRow}
      <div style="margin-bottom: 6px;"><strong>Registration number:</strong> ${registration.registrationNumber}</div>
      <div><strong>Registered at:</strong> ${new Date(registration.registeredAt).toLocaleString('en-US')}</div>
    </div>
    <p><strong>Total registrations so far:</strong> ${totalRegistrations}<br/>
    <strong>Total attendees:</strong> ${totalAttendees}</p>
  `;
  return emailWrapper(body);
}

function cancellationEmailHtml(registration) {
  const body = `
    <p style="font-size: 18px;">Hi ${registration.firstName},</p>
    <p>Your registration (${registration.registrationNumber}) for <strong>${process.env.EVENT_NAME}</strong> has been cancelled.</p>
    <p>Sorry to see you go — we hope to see you at a future event!</p>
  `;
  return emailWrapper(body);
}

function oneWeekReminderHtml(registration) {
  const body = `
    <p style="font-size: 18px;">Hi ${registration.firstName}! 🍂</p>
    <p>Just one week until <strong>${process.env.EVENT_NAME}</strong>! We're so excited to celebrate with you.</p>
    ${detailsBox()}
    ${menuBox()}
    <div style="background-color: #FFFBF5; border: 1px solid #E8D9C5; border-radius: 8px; padding: 16px 20px; margin: 18px 0;">
      <div><strong>Your registration number:</strong> ${registration.registrationNumber}</div>
    </div>
    <p style="text-align: center; padding-top: 6px;">Come hungry and leave full! 🦃🍂</p>
    <p style="text-align: center;">Know someone who'd love to join us? Share the word and bring them along!</p>
  `;
  return emailWrapper(body);
}

function dayBeforeReminderHtml(registration) {
  const body = `
    <p style="font-size: 18px;">Hi ${registration.firstName}!</p>
    <p><strong>Tomorrow is the day!</strong> ${process.env.EVENT_NAME} is happening tomorrow! We can't wait to celebrate with you.</p>
    ${detailsBox()}
    ${menuBox()}
    <div style="background-color: #FFFBF5; border: 1px solid #E8D9C5; border-radius: 8px; padding: 16px 20px; margin: 18px 0;">
      <div><strong>Your registration number:</strong> ${registration.registrationNumber}</div>
    </div>
    <p>Get ready for great fellowship, warm food, and cool treats. We can't wait to see you tomorrow! 🍂</p>
  `;
  return emailWrapper(body);
}

function dayOfReminderHtml(registration) {
  const body = `
    <p style="font-size: 18px;">Hi ${registration.firstName}!</p>
    <p><strong>It's finally here!</strong> ${process.env.EVENT_NAME} is happening today and we're so excited to see you.</p>
    ${detailsBox()}
    ${menuBox()}
    <p>Come hungry, come joyful — see you soon! 🧡</p>
  `;
  return emailWrapper(body);
}

// ---------- Email senders ----------

const FROM_ADDRESS = `${process.env.ADMIN_NAME} <${process.env.FROM_EMAIL}>`;

async function sendEmail(to, subject, html) {
  console.log('Attempting to send email via Resend...');
  console.log(`  From: ${FROM_ADDRESS}`);
  console.log(`  To: ${to}`);
  console.log(`  Subject: ${subject}`);

  try {
    const { data, error } = await resend.emails.send({
      to,
      from: FROM_ADDRESS,
      subject,
      html
    });

    if (error) {
      console.error(`Email send FAILED to ${to}:`, error);
    } else {
      console.log(`Email send SUCCESS to ${to} (id: ${data ? data.id : 'unknown'})`);
    }
  } catch (err) {
    console.error(`Email send FAILED to ${to}:`, err);
  }
}

async function sendConfirmationEmail(registration) {
  await sendEmail(
    registration.email,
    `You're registered! — ${process.env.EVENT_NAME} 🍂`,
    confirmationEmailHtml(registration)
  );
}

async function sendAdminNotification(registration, allRegistrations) {
  const confirmed = allRegistrations.filter(r => r.status === 'confirmed');
  const totalRegistrations = confirmed.length;
  const totalAttendees = confirmed.reduce((sum, r) => sum + Number(r.partySize), 0);

  await sendEmail(
    process.env.ADMIN_EMAIL,
    `New Registration — ${registration.firstName} ${registration.lastName} — ${process.env.EVENT_NAME}`,
    adminNotificationHtml(registration, totalRegistrations, totalAttendees)
  );
}

async function sendCancellationEmail(registration) {
  await sendEmail(
    registration.email,
    `Registration Cancelled — ${process.env.EVENT_NAME}`,
    cancellationEmailHtml(registration)
  );
}

// ---------- Routes ----------

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', (req, res) => {
  if (req.query.key !== process.env.ADMIN_DASHBOARD_KEY) {
    return res.status(401).send('Access denied. Invalid key.');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.post('/api/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, partySize, specialRequests } = req.body;

    if (!firstName || !lastName || !email || !phone || !partySize) {
      return res.status(400).json({ error: 'missing_fields', message: 'Please fill in all required fields.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'invalid_email', message: 'Please enter a valid email address.' });
    }

    const size = Number(partySize);
    if (!Number.isInteger(size) || size < 1 || size > 10) {
      return res.status(400).json({ error: 'invalid_party_size', message: 'Party size must be a number between 1 and 10.' });
    }

    const registrations = readRegistrations();

    const duplicate = registrations.find(r => r.email.toLowerCase() === email.toLowerCase() && r.status === 'confirmed');
    if (duplicate) {
      return res.status(409).json({ error: 'already_registered', message: 'This email is already registered for this event.' });
    }

    const registration = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      registrationNumber: generateRegistrationNumber(registrations),
      firstName,
      lastName,
      email,
      phone,
      partySize: size,
      specialRequests: specialRequests || '',
      registeredAt: new Date().toISOString(),
      status: 'confirmed'
    };

    registrations.push(registration);
    writeRegistrations(registrations);

    await sendConfirmationEmail(registration);
    await sendAdminNotification(registration, registrations);

    res.json({
      success: true,
      registrationNumber: registration.registrationNumber,
      message: "You're on the list!"
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'server_error', message: 'Something went wrong. Please try again.' });
  }
});

app.get('/api/registrations', (req, res) => {
  if (req.query.key !== process.env.ADMIN_DASHBOARD_KEY) {
    return res.status(401).json({ error: 'unauthorized', message: 'Access denied. Invalid key.' });
  }
  res.json(readRegistrations());
});

app.get('/api/reminder-status', (req, res) => {
  if (req.query.key !== process.env.ADMIN_DASHBOARD_KEY) {
    return res.status(401).json({ error: 'unauthorized', message: 'Access denied. Invalid key.' });
  }
  const reminders = readReminders();
  res.json({
    one_week: {
      sent: Boolean(reminders.one_week && reminders.one_week.length > 0),
      count: (reminders.one_week || []).length
    },
    day_before: {
      sent: Boolean(reminders.day_before && reminders.day_before.length > 0),
      count: (reminders.day_before || []).length
    },
    day_of: {
      sent: Boolean(reminders.day_of && reminders.day_of.length > 0),
      count: (reminders.day_of || []).length
    }
  });
});

app.post('/api/cancel/:id', async (req, res) => {
  if (req.body.key !== process.env.ADMIN_DASHBOARD_KEY) {
    return res.status(401).json({ error: 'unauthorized', message: 'Access denied. Invalid key.' });
  }

  const registrations = readRegistrations();
  const registration = registrations.find(r => r.id === req.params.id);

  if (!registration) {
    return res.status(404).json({ error: 'not_found', message: 'Registration not found.' });
  }

  registration.status = 'cancelled';
  writeRegistrations(registrations);

  await sendCancellationEmail(registration);

  res.json({ success: true, message: 'Registration cancelled.' });
});

app.get('/api/resend/:id', async (req, res) => {
  if (req.query.key !== process.env.ADMIN_DASHBOARD_KEY) {
    return res.status(401).json({ error: 'unauthorized', message: 'Access denied. Invalid key.' });
  }

  const registrations = readRegistrations();
  const registration = registrations.find(r => r.id === req.params.id);

  if (!registration) {
    return res.status(404).json({ error: 'not_found', message: 'Registration not found.' });
  }

  await sendConfirmationEmail(registration);

  res.json({ success: true, message: 'Confirmation email resent.' });
});

app.get('/api/event-info', (req, res) => {
  res.json({
    eventName: process.env.EVENT_NAME,
    eventDate: process.env.EVENT_DATE,
    eventTime: process.env.EVENT_TIME,
    eventLocation: process.env.EVENT_LOCATION,
    eventDescription: process.env.EVENT_DESCRIPTION
  });
});

app.get('/test-one-week-reminder', async (req, res) => {
  if (req.query.key !== process.env.ADMIN_DASHBOARD_KEY) {
    return res.status(401).json({ error: 'unauthorized', message: 'Access denied. Invalid key.' });
  }

  const registrations = readRegistrations();
  const confirmed = registrations.filter(r => r.status === 'confirmed');
  const reminders = readReminders();

  const sentCount = await sendReminderBatch(
    'one_week',
    `One week away! 🍂 ${process.env.EVENT_NAME}`,
    oneWeekReminderHtml,
    confirmed,
    reminders
  );

  res.json({ success: true, message: `One week reminder sent to ${sentCount} registrant(s).` });
});

app.get('/api/export', (req, res) => {
  if (req.query.key !== process.env.ADMIN_DASHBOARD_KEY) {
    return res.status(401).json({ error: 'unauthorized', message: 'Access denied. Invalid key.' });
  }

  const registrations = readRegistrations();
  const headers = ['Registration #', 'First Name', 'Last Name', 'Email', 'Phone', 'Party Size', 'Special Requests', 'Registered At', 'Status'];

  const escapeCsv = (value) => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = registrations.map(r => [
    r.registrationNumber,
    r.firstName,
    r.lastName,
    r.email,
    r.phone,
    r.partySize,
    r.specialRequests,
    r.registeredAt,
    r.status
  ].map(escapeCsv).join(','));

  const csv = [headers.join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="FaithFoodFellowship_Attendees.csv"');
  res.send(csv);
});

app.get('/test-email', async (req, res) => {
  if (req.query.key !== process.env.ADMIN_DASHBOARD_KEY) {
    return res.status(401).json({ error: 'unauthorized', message: 'Access denied. Invalid key.' });
  }

  const targetEmail = req.query.email || process.env.ADMIN_EMAIL;

  const testRegistration = {
    id: 'test-preview',
    registrationNumber: 'FFF-001',
    firstName: 'Albert',
    lastName: 'Rios',
    email: targetEmail,
    phone: '000-000-0000',
    partySize: 4,
    specialRequests: '',
    registeredAt: new Date().toISOString(),
    status: 'confirmed'
  };

  await sendConfirmationEmail(testRegistration);

  res.json({ success: true, message: `Test confirmation email sent to ${targetEmail}.` });
});

// ---------- Reminder scheduler ----------

async function sendReminderBatch(type, subject, htmlFn, confirmed, reminders) {
  reminders[type] = reminders[type] || [];
  const toRemind = confirmed.filter(r => !reminders[type].includes(r.email));
  for (const registration of toRemind) {
    await sendEmail(registration.email, subject, htmlFn(registration));
    reminders[type].push(registration.email);
  }
  if (toRemind.length) writeReminders(reminders);
  return toRemind.length;
}

async function checkReminders() {
  try {
    const [year, month, day] = process.env.EVENT_DATE.split('-').map(Number);
    const now = new Date();

    const oneWeekBefore = new Date(year, month - 1, day - 7);
    const dayBefore = new Date(year, month - 1, day - 1);
    const dayOf = new Date(year, month - 1, day);

    const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    const registrations = readRegistrations();
    const confirmed = registrations.filter(r => r.status === 'confirmed');
    const reminders = readReminders();

    const testReminderMode = process.env.TEST_REMINDER_MODE === 'true';

    if (testReminderMode || (isSameDay(now, oneWeekBefore) && now.getHours() >= 10)) {
      if (testReminderMode) {
        console.log('TEST_REMINDER_MODE is enabled — sending one-week reminder immediately, ignoring the event date.');
      }
      await sendReminderBatch('one_week', `One week away! 🍂 ${process.env.EVENT_NAME}`, oneWeekReminderHtml, confirmed, reminders);
    }

    if (testReminderMode || (isSameDay(now, dayBefore) && now.getHours() >= 10)) {
      if (testReminderMode) {
        console.log('TEST_REMINDER_MODE is enabled — sending day-before reminder immediately, ignoring the event date.');
      }
      await sendReminderBatch('day_before', `See you tomorrow! 🍂 ${process.env.EVENT_NAME}`, dayBeforeReminderHtml, confirmed, reminders);
    }

    if (isSameDay(now, dayOf) && now.getHours() >= 9) {
      await sendReminderBatch('day_of', `Today is the day! 🎉 ${process.env.EVENT_NAME}`, dayOfReminderHtml, confirmed, reminders);
    }
  } catch (err) {
    console.error('Reminder check error:', err);
  }
}

setInterval(checkReminders, 60 * 60 * 1000);
checkReminders();

app.listen(PORT, () => {
  console.log(`Faith Food and Fellowship registration server running on port ${PORT}`);
});
