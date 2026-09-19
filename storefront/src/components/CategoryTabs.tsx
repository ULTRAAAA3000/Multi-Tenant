import type { Category } from "../lib/types";
import "./CategoryTabs.css";

interface CategoryTabsProps {
  categories: Category[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryTabs({ categories, activeId, onSelect }: CategoryTabsProps) {
  if (categories.length === 0) return null;

  return (
    <div className="category-tabs" role="tablist" aria-label="Product categories">
      <button
        className={`category-tab ${activeId === null ? "active" : ""}`}
        role="tab"
        aria-selected={activeId === null}
        onClick={() => onSelect(null)}
      >
        All
      </button>
      {categories.map((category) => (
        <button
          key={category.id}
          className={`category-tab ${activeId === category.id ? "active" : ""}`}
          role="tab"
          aria-selected={activeId === category.id}
          onClick={() => onSelect(category.id)}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
