import type { Category } from "./types";

interface Props {
  categories: Category[];
}

export default function CategoryManager({ categories }: Props) {
  return (
    <div className="category-manager">
      <h2>Categories</h2>
      <div className="cat-list">
        {categories.map((cat) => (
          <div key={cat.id} className="cat-item">
            <span className="cat-name">{cat.name}</span>
          </div>
        ))}
        {categories.length === 0 && (
          <p className="empty-sm">No categories found in the worlds folder.</p>
        )}
      </div>
    </div>
  );
}
