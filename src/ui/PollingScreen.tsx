interface Props {
  message: string;
}

export function PollingScreen({ message }: Props) {
  return (
    <div className="center">
      <div className="spinner" />
      <h1>Lokalit</h1>
      <p>{message}</p>
    </div>
  );
}
