-- Ny status i inbjudningskedjan: står på tur men har inte fått frågan än.
alter type assignment_status add value if not exists 'vantar';
