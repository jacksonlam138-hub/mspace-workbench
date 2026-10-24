/** 图标与本地 SVG 餐品插画（沿用 demo 评审快照视觉） */

const PATHS: Record<string, string> = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  new: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',
  nutrition: '<path d="M20 4C7 2 2 9 6 15c4 6 13 4 14-11Z"/><path d="M4 21 16 9"/>',
  blind: '<rect x="4" y="8" width="16" height="13" rx="2"/><path d="M3 8h18M12 8v13M12 8C1 8 6-2 12 8Zm0 0C23 8 18-2 12 8Z"/>',
  team: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v2"/>',
  agent: '<rect x="3" y="7" width="18" height="14" rx="4"/><path d="M12 3v4M8 12v3M16 12v3M9 18h6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
};

export function Icon({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? PATHS.new }}
    />
  );
}

const BUN = '<path d="M37 76c1-37 26-54 63-54s62 17 63 54Z" fill="#e9aa4c"/><path d="M42 66c10-27 35-35 58-35 25 0 47 10 58 35" fill="#f7c76e"/><g stroke="#fff0b0" stroke-width="4" stroke-linecap="round"><path d="m69 48 5-2M94 40l5 1M121 47l5-2M143 58l4 2M57 61l5 1M105 56l4-2"/></g><rect x="33" y="81" width="134" height="15" rx="7" fill="#509952"/><path d="m37 91 25 9 25-7 26 9 27-8 23 7v10H37Z" fill="#f6cf48"/><rect x="34" y="105" width="132" height="19" rx="9" fill="#713f2e"/><path d="M38 128h124c-2 22-17 26-62 26s-60-5-62-26" fill="#e7a34d"/><path d="M43 129h114" stroke="#f9c477" stroke-width="7" stroke-linecap="round"/>';
const FRIES = '<g fill="#ffc542" stroke="#e4a22d" stroke-width="2"><path d="m62 86-7-65 12-1 10 69M83 85l-3-74 12-1 7 80M104 87l7-70 12 1-5 75M125 90l17-59 12 4-16 62M72 90l-1-51 11-1 4 51"/></g><path d="m49 75 15 77h78l15-77c-31 17-77 17-108 0" fill="#d94b32"/><path d="M61 95h81l-9 47H72Z" fill="#e75a3d"/><path d="M85 129v-18c0-16 16-16 16 0v18-18c0-16 16-16 16 0v18" stroke="#ffd652" stroke-width="5" fill="none"/>';
const DRINK = '<path d="m77 40 7 112h52l7-112" fill="#f2d9aa"/><path d="m91 55 5 86h29l5-86" fill="#b6d2c0"/><path d="m121 43 9-33h22" fill="none" stroke="#ed8b51" stroke-width="7"/><rect x="70" y="37" width="80" height="13" rx="6" fill="#faf6e3"/><circle cx="109" cy="94" r="17" fill="#087f83"/><path d="m99 95 8 8 13-17" stroke="#ffdc6a" stroke-width="4" fill="none"/>';
const NUGGETS = '<g fill="#e6a54a" stroke="#cd8938" stroke-width="3"><rect x="40" y="43" width="53" height="39" rx="16" transform="rotate(-15 65 63)"/><rect x="108" y="48" width="55" height="36" rx="14" transform="rotate(13 130 60)"/><rect x="60" y="90" width="52" height="41" rx="15" transform="rotate(10 80 110)"/><rect x="120" y="95" width="43" height="36" rx="13"/></g><g fill="#f8c76c"><circle cx="59" cy="55" r="3"/><circle cx="78" cy="63" r="3"/><circle cx="130" cy="64" r="4"/><circle cx="82" cy="106" r="4"/><circle cx="140" cy="111" r="3"/></g>';

export type FoodType = 'burger' | 'fries' | 'drink' | 'nuggets' | 'meal';

export function FoodArt({ type = 'burger' }: { type?: FoodType }) {
  let content = BUN;
  if (type === 'fries') content = FRIES;
  if (type === 'drink') content = DRINK;
  if (type === 'nuggets') content = NUGGETS;
  if (type === 'meal') {
    content = `<g transform="translate(92 7) scale(.64)">${DRINK}</g><g transform="translate(-8 27) scale(.76)">${BUN}</g><g transform="translate(85 85) scale(.38)">${NUGGETS}</g>`;
  }
  return (
    <svg
      viewBox="0 0 210 175"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: `<ellipse cx="105" cy="159" rx="70" ry="8" fill="#755c2520"/>${content}` }}
    />
  );
}
