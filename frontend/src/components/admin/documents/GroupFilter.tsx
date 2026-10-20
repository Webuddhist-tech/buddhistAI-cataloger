import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useOutlinerGroups } from '@/hooks';

type GroupFilterProps = Readonly<{
  value: string;
  onChange: (groupId: string) => void;
}>;

/** Admin-only: documents assigned from one work group. */
export function GroupFilter({ value, onChange }: GroupFilterProps) {
  const { groups } = useOutlinerGroups();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full max-w-40" aria-label="Filter by group">
        <SelectValue placeholder="All groups" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All groups</SelectItem>
        {groups.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
