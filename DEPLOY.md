# פריסה לטלפון (GitHub Pages) — נשאר רק צעד אחד שלך

הכל בנוי, נבדק, ו-committed מקומית (ענף `main`). כדי להעלות לאוויר ולהשתמש בטלפון,
צריך שתיצור את המאגר ב-GitHub (פעולה שדורשת אישור אנושי, לכן לא עשיתי אותה לבד).

## אפשרות א — הכי מהיר (שורת פקודה)
ב-PowerShell רגיל, בתוך התיקייה `C:\Users\03hag\Claude projects\hebrew-words`:

```powershell
gh repo create milim --public --source=. --remote=origin --push
gh api -X POST repos/Hagay-BOT/milim/pages -f "source[branch]=main" -f "source[path]=/"
```

אחרי דקה, הכתובת תהיה:
**https://hagay-bot.github.io/milim/**

## אפשרות ב — דרך האתר (בלי פקודות)
1. היכנס ל-github.com → New repository → שם: `milim` → Public → Create.
2. אמור לי "יצרתי", ואני אדחוף את הקוד ואפעיל Pages.
   (או: בעמוד המאגר → Settings → Pages → Branch: `main` / root → Save.)

## בטלפון
1. פתח את הכתובת בדפדפן.
2. תפריט הדפדפן → "הוסף למסך הבית" / "התקן אפליקציה".
3. ייפתח כאפליקציה שעובדת **אופליין**, בלי המחשב שלך. כל ההתקדמות נשמרת בטלפון.

## עדכון מילים בעתיד
לאחר שינוי מילים במחשב: `git add -A && git commit -m "update" && git push`,
ולעדכן את מספר הגרסה ב-`sw.js` (`hw-v1` → `hw-v2`) כדי שהטלפון ימשוך את החדש.

## הערת זכויות יוצרים
המילים מגיעות מסטים ציבוריים של "פסיכומטרי קמפוס" ב-Quizlet. מאגר GitHub ציבורי
חושף את רשימת המילים בכתובת (אמנם ציבורית ממילא ב-Quizlet). אם תעדיף שזה יהיה פרטי —
צריך מנוי GitHub בתשלום כדי ש-Pages יעבוד על מאגר פרטי. תגיד לי אם תרצה שנלך לכיוון אחר.
