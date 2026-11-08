> **Note (2026-11-08):** voice was dropped, so the spoken use cases go through the written "Întreabă" assistant. The bad-year fund was also removed, so fund cases are out of scope. What is built: `docs/10-plan.md` and `progress.md`.
The groups:
  - A. Getting started (1–5): onboarding by voice, a photo of the APIA decision, a "where do these numbers come from?" summary for his daughter.
  - B. Everyday money (6–13): "Cât pot cheltui?", "Pot să-mi iau o drujbă?", logging an expense or sale by voice with a card he confirms.
  - C. When money arrives (14–17): the APIA advance split into envelopes (the demo moment), money with no label, APIA paying less than expected.
  - D. Calendar (18–23): when the rest of the APIA money comes, a Sunday summary of the week, the documents he needs, recurring bills.
  - E. Forecast (24–30): "Îmi ajung?", a drought year, selling later, the price at which he stops losing money, "Să vând la 0,88?" (the AI shows the numbers, never
    says yes or no).
  - F. Spring gap and credit (31–34): a warning in November about April, adding a planned credit, what it costs (no bank named).
  - G. Bad-years fund and pension (35–40): why the fund, taking money out of it (the AI shows the effect but doesn't refuse), simulating, starting and skipping
    pension payments.
  - H. Subsidies and paperwork (41–47): the subsidy as a range, why each line is that amount, the diesel report, tax, the AFIR radar, published rate changes.
  - I. Family and safety (48–50): sending things to his daughter, "spune-mi mai simplu", and spotting a fake SMS asking for card details.

  What came out of planning it:
  - 36 of the 50 are voice. A mic button and read-aloud matter more for Ion than a chat window. Romanian speech-to-text on a cheap phone with weak signal is the main
    open question.
  - 8 start with the app speaking first (notifications), which fits someone who won't go looking.
  - The AI follows the rules already in your functions plan: it never does the arithmetic itself, anything that saves goes through a confirm card, and edits or undo
    stay with the user (in #12 the AI opens the row pre-filled instead). The words banned in the UI are banned in its answers too.
  - 13 new functions are needed, such as extract_document, check_purchase, add_planned_credit, simulate_pension and generate_diesel_report. They're listed with their
    access level.
  - 21 are marked MVP, 25 Should and 4 Later. The suggested build order is: read-only answers to the four questions first, then voice logging, then the money-arriving
    and November-warning story, then safety.